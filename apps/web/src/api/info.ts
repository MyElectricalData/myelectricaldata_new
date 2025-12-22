export interface AppInfo {
  name: string
  version: string
  description: string
  documentation: string
}

export const infoApi = {
  /**
   * Get API information including version
   */
  async getInfo(): Promise<AppInfo> {
    // The root endpoint returns info directly, not wrapped in APIResponse
    const response = await fetch('/api/', {
      credentials: 'include',
    })
    return response.json()
  },
}
