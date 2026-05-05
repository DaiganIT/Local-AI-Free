import { useState, useCallback } from 'react'
import { useUploadFile, type UploadFileResponse } from './useUploadFile'

export interface PendingAttachment {
  id: string
  name: string
  status: 'uploading' | 'done' | 'error'
  /** MIME type from the File object (available immediately). */
  mimeType?: string
  /** Server path returned after successful upload. */
  serverPath?: string
  /** File size returned from server. */
  size?: number
  /** Error message if upload failed. */
  error?: string
}

export interface UsePendingAttachmentsOptions {
  agentId?: string
  workspaceId?: string
  hostId?: string
}

let attachmentIdCounter = 0

/**
 * Hook that manages pending file attachments.
 *
 * When files are added via `addFiles()`, they are:
 * 1. Immediately uploaded via `useUploadFile` (multipart — no FileReader needed)
 * 2. Tracked with uploading/done/error status
 * 3. Metadata (name, mimeType) extracted from the File object upfront
 *
 * The send button should be disabled while `isUploading` is true.
 */
export function usePendingAttachments({ agentId, workspaceId, hostId }: UsePendingAttachmentsOptions) {
  const uploadFile = useUploadFile({ agentId, workspaceId, hostId })
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  // Count of uploads currently in flight — tracked as state for reactivity
  const [inflightCount, setInflightCount] = useState(0)

  const addFiles = useCallback((files: File[]) => {
    for (const file of files) {
      const id = `att-${++attachmentIdCounter}`

      const attachment: PendingAttachment = {
        id,
        name: file.name,
        status: 'uploading',
        mimeType: file.type || undefined,
      }

      setAttachments((prev) => [...prev, attachment])
      setInflightCount((prev) => prev + 1)

      // Pass the File directly — multipart handles reading
      uploadFile
        .mutateAsync({ file })
        .then((res: UploadFileResponse) => {
          setInflightCount((prev) => prev - 1)
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, status: 'done', serverPath: res.path, size: res.size, mimeType: res.mimeType ?? a.mimeType }
                : a,
            ),
          )
        })
        .catch((err: unknown) => {
          setInflightCount((prev) => prev - 1)
          const message = err instanceof Error ? err.message : 'Upload failed'
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, status: 'error', error: message }
                : a,
            ),
          )
        })
    }
  }, [uploadFile])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id)
      // If it was still uploading, decrement inflight
      if (att?.status === 'uploading') {
        setInflightCount((c) => Math.max(0, c - 1))
      }
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const clearAttachments = useCallback(() => {
    setInflightCount(0)
    setAttachments([])
  }, [])

  const isUploading = inflightCount > 0

  return {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    isUploading,
  }
}
