import { generalSettings } from './storage-utils';
import { Template } from '../types/types';
import { sanitizeFileName } from './string-utils';

export interface LocalRestApiResponse {
	success: boolean;
	error?: string;
}

/**
 * Test if Local REST API is available and configured
 */
export async function isLocalRestApiAvailable(): Promise<boolean> {
	if (!generalSettings.localRestApiEnabled) {
		return false;
	}

	if (!generalSettings.localRestApiUrl || !generalSettings.localRestApiKey) {
		return false;
	}

	return true;
}

/**
 * Test connection to Local REST API
 */
export async function testLocalRestApiConnection(): Promise<LocalRestApiResponse> {
	try {
		const response = await fetch(`${generalSettings.localRestApiUrl}/`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${generalSettings.localRestApiKey}`,
			},
		});

		if (response.ok) {
			return { success: true };
		} else {
			const errorText = await response.text();
			return {
				success: false,
				error: `HTTP ${response.status}: ${errorText}`
			};
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Create or modify a note via Local REST API
 */
export async function createNoteViaLocalRestApi(
	fileContent: string,
	noteName: string,
	path: string,
	vault: string,
	behavior: Template['behavior']
): Promise<LocalRestApiResponse> {
	try {
		const available = await isLocalRestApiAvailable();
		if (!available) {
			return { success: false, error: 'Local REST API not available' };
		}

		// Ensure path ends with a slash if it exists
		if (path && !path.endsWith('/')) {
			path += '/';
		}

		const formattedNoteName = sanitizeFileName(noteName);
		const filePath = `${path}${formattedNoteName}.md`;

		// Encode vault name and file path for URL
		const encodedVault = encodeURIComponent(vault || '');
		const encodedFilePath = encodeURIComponent(filePath);

		let url: string;
		let method: string;
		let body: any;

		const isDailyNote = behavior === 'append-daily' || behavior === 'prepend-daily';

		if (isDailyNote) {
			// For daily notes, we need to get the daily note path first
			// This is a simplified approach - may need refinement based on API capabilities
			const today = new Date().toISOString().split('T')[0];
			const dailyNotePath = `${today}.md`;
			url = `${generalSettings.localRestApiUrl}/vault/${encodedVault}/${encodeURIComponent(dailyNotePath)}`;

			if (behavior === 'append-daily') {
				method = 'PATCH';
				body = JSON.stringify({
					content: fileContent,
					position: 'end'
				});
			} else { // prepend-daily
				method = 'PATCH';
				body = JSON.stringify({
					content: fileContent,
					position: 'start'
				});
			}
		} else {
			// Handle regular notes
			switch (behavior) {
				case 'append-specific':
					method = 'PATCH';
					url = `${generalSettings.localRestApiUrl}/vault/${encodedVault}/${encodedFilePath}`;
					body = JSON.stringify({
						content: fileContent,
						position: 'end'
					});
					break;
				case 'prepend-specific':
					method = 'PATCH';
					url = `${generalSettings.localRestApiUrl}/vault/${encodedVault}/${encodedFilePath}`;
					body = JSON.stringify({
						content: fileContent,
						position: 'start'
					});
					break;
				case 'overwrite':
					method = 'PUT';
					url = `${generalSettings.localRestApiUrl}/vault/${encodedVault}/${encodedFilePath}`;
					body = fileContent;
					break;
				default: // 'create'
					method = 'POST';
					url = `${generalSettings.localRestApiUrl}/vault/${encodedVault}/${encodedFilePath}`;
					body = fileContent;
					break;
			}
		}

		const headers: HeadersInit = {
			'Authorization': `Bearer ${generalSettings.localRestApiKey}`,
		};

		// Set appropriate content type based on body type
		if (typeof body === 'string' && body.startsWith('{')) {
			headers['Content-Type'] = 'application/json';
		} else {
			headers['Content-Type'] = 'text/markdown';
		}

		const response = await fetch(url, {
			method,
			headers,
			body
		});

		if (response.ok) {
			return { success: true };
		} else {
			const errorText = await response.text();
			return {
				success: false,
				error: `HTTP ${response.status}: ${errorText}`
			};
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

