/**
 * Helper to upload a JSON file to Google Drive using the REST API v3
 * Uses a multipart/related upload to set the filename and content.
 */

export async function uploadToGoogleDrive(
  accessToken: string,
  fileContent: string,
  filename: string
): Promise<any> {
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const contentType = 'application/json';
  
  const metadata = {
    name: filename,
    mimeType: contentType
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + contentType + '\r\n\r\n' +
    fileContent +
    close_delim;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': multipartRequestBody.length.toString()
    },
    body: multipartRequestBody
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google Drive API Error: ${errorData.error?.message || response.statusText}`);
  }

  return response.json();
}
