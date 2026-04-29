const DEFAULT_API_URL = 'https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/'

interface ThunderSettings {
  settings?: { get: (key: string) => string | undefined }
}

const thunder = (window as unknown as { thunder?: ThunderSettings }).thunder
export const API_URL = thunder?.settings?.get('apiUrl') ?? DEFAULT_API_URL
