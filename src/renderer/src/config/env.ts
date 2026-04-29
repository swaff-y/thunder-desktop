const DEFAULT_API_URL = 'https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/'

interface ThunderSettings {
  settings?: { get: (key: string) => string | undefined }
}

const settings = (window.thunder as unknown as ThunderSettings).settings
export const API_URL = settings?.get('apiUrl') ?? DEFAULT_API_URL
