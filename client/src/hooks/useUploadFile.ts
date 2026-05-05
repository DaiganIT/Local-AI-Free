import { useMutation } from '@tanstack/react-query'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

/**
 * Build headers for a multipart upload.
 * Do NOT set Content-Type — the browser sets it with the correct boundary.
 */
function headers() {
  const h: Record<string, string> = {}
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export interface UploadFileResponse {
  path: string
  name: string
  size: number
  mimeType?: string
}

export interface UseUploadFileOptions {
  agentId?: string
  workspaceId?: string
  hostId?: string
}

/**
 * Hook to upload a file to an agent's or workspace's uploads directory.
 * Sends the file as multipart/form-data — no FileReader needed.
 *
 * - For agents: call with `{ agentId }`. Fans out to all hosts.
 * - For workspaces: call with `{ workspaceId, hostId }`. Routes to a specific host.
 */
export function useUploadFile({ agentId, workspaceId, hostId }: UseUploadFileOptions) {
  return useMutation<UploadFileResponse, Error, { file: File }>({
    mutationFn: async ({ file }) => {
      if (agentId) {
        const form = new FormData()
        form.append('file', file)

        const res = await fetch(
          `${RELAY_URL}/api/agents/${encodeURIComponent(agentId)}/uploads`,
          {
            method: 'POST',
            headers: headers(),
            body: form,
          },
        )
        if (!res.ok) {
          throw new Error(`Upload failed: ${res.status}`)
        }
        return res.json() as Promise<UploadFileResponse>
      }

      if (workspaceId && hostId) {
        const form = new FormData()
        form.append('file', file)
        form.append('hostId', hostId)

        const res = await fetch(
          `${RELAY_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/uploads`,
          {
            method: 'POST',
            headers: headers(),
            body: form,
          },
        )
        if (!res.ok) {
          throw new Error(`Upload failed: ${res.status}`)
        }
        return res.json() as Promise<UploadFileResponse>
      }

      throw new Error('Must provide agentId or (workspaceId + hostId)')
    },
  })
}