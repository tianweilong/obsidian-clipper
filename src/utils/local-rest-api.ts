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
 * Check if a file exists via Local REST API
 */
async function checkFileExists(vault: string, filePath: string): Promise<boolean> {
	try {
		const encodedFilePath = encodeURIComponent(filePath);
		let url: string;

		if (vault) {
			const encodedVault = encodeURIComponent(vault);
			url = `${generalSettings.localRestApiUrl}/vault/${encodedVault}/${encodedFilePath}`;
		} else {
			url = `${generalSettings.localRestApiUrl}/vault/${encodedFilePath}`;
		}

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${generalSettings.localRestApiKey}`,
			},
		});

		// 200-299 range means file exists
		if (response.ok) {
			return true;
		}

		// 404 means file doesn't exist - this is expected and not an error
		if (response.status === 404) {
			return false;
		}

		// Other errors (401, 403, 500, etc.) - log but still return false
		console.warn(`Unexpected response when checking file existence: ${response.status}`);
		return false;
	} catch (error) {
		// Network errors or other exceptions - log and return false
		console.warn('Error checking file existence:', error);
		return false;
	}
}

/**
 * Find next available filename with incremental suffix
 */
async function findAvailableFileName(vault: string, path: string, baseName: string): Promise<string> {
	let filePath = `${path}${baseName}.md`;
	let fileExists = await checkFileExists(vault, filePath);

	if (!fileExists) {
		return filePath;
	}

	// File exists, try with incremental numbers: "A 1", "A 2", etc.
	let counter = 1;
	while (counter < 1000) { // Safety limit
		filePath = `${path}${baseName} ${counter}.md`;
		fileExists = await checkFileExists(vault, filePath);
		if (!fileExists) {
			return filePath;
		}
		counter++;
	}

	// Fallback: use timestamp if we hit the limit
	const timestamp = Date.now();
	return `${path}${baseName} ${timestamp}.md`;
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

		// Helper function to build URL with proper vault handling
		const buildUrl = (targetPath: string): string => {
			const encodedPath = encodeURIComponent(targetPath);
			if (vault) {
				const encodedVault = encodeURIComponent(vault);
				return `${generalSettings.localRestApiUrl}/vault/${encodedVault}/${encodedPath}`;
			} else {
				return `${generalSettings.localRestApiUrl}/vault/${encodedPath}`;
			}
		};

		let filePath: string;
		let url: string;
		let method: string;
		let body: any;

		const isDailyNote = behavior === 'append-daily' || behavior === 'prepend-daily';

		if (isDailyNote) {
			// For daily notes, we need to get the daily note path first
			const today = new Date().toISOString().split('T')[0];
			const dailyNotePath = `${today}.md`;
			const dailyFileExists = await checkFileExists(vault, dailyNotePath);
			url = buildUrl(dailyNotePath);

			if (!dailyFileExists) {
				// Create the daily note first
				method = 'POST';
				body = fileContent;
			} else if (behavior === 'append-daily') {
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
					filePath = `${path}${formattedNoteName}.md`;
					const appendFileExists = await checkFileExists(vault, filePath);
					url = buildUrl(filePath);
					if (!appendFileExists) {
						// Create the file with POST
						method = 'POST';
						body = fileContent;
					} else {
						// File exists, use PATCH to append
						method = 'PATCH';
						body = JSON.stringify({
							content: fileContent,
							position: 'end'
						});
					}
					break;
				case 'prepend-specific':
					filePath = `${path}${formattedNoteName}.md`;
					const prependFileExists = await checkFileExists(vault, filePath);
					url = buildUrl(filePath);
					if (!prependFileExists) {
						// Create the file with POST
						method = 'POST';
						body = fileContent;
					} else {
						// File exists, use PATCH to prepend
						method = 'PATCH';
						body = JSON.stringify({
							content: fileContent,
							position: 'start'
						});
					}
					break;
				case 'overwrite':
					// Always overwrite, whether file exists or not
					filePath = `${path}${formattedNoteName}.md`;
					url = buildUrl(filePath);
					method = 'PUT';
					body = fileContent;
					break;
				default: // 'create'
					// Find available filename with auto-increment if needed
					filePath = await findAvailableFileName(vault, path, formattedNoteName);
					url = buildUrl(filePath);
					method = 'POST';
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

