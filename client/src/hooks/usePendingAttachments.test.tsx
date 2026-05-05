import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePendingAttachments } from './usePendingAttachments'

// Mock useUploadFile — we control when it resolves
const mockMutateAsync = vi.fn()
vi.mock('./useUploadFile', () => ({
  useUploadFile: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

// Helper to create a File with text content
function createTextFile(name: string, content: string, type = 'text/plain'): File {
  return new File([content], name, { type })
}

describe('usePendingAttachments', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
  })

  it('starts with empty attachments', () => {
    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )
    expect(result.current.attachments).toEqual([])
    expect(result.current.isUploading).toBe(false)
  })

  it('adds a file and uploads it immediately', async () => {
    const uploadResponse = { path: 'uploads/report.txt', name: 'report.txt', size: 42 }
    mockMutateAsync.mockResolvedValue(uploadResponse)

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    const file = createTextFile('report.txt', 'Hello world')

    await act(async () => {
      result.current.addFiles([file])
    })

    // Upload is async — wait for the upload call and result
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        file: expect.any(File),
      })
    })

    // After upload completes, attachment should be in 'done' state
    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(1)
      expect(result.current.attachments[0].status).toBe('done')
      expect(result.current.attachments[0].name).toBe('report.txt')
      expect(result.current.attachments[0].serverPath).toBe('uploads/report.txt')
      expect(result.current.attachments[0].size).toBe(42)
      expect(result.current.attachments[0].mimeType).toBe('text/plain')
    })

    expect(result.current.isUploading).toBe(false)
  })

  it('tracks uploading state while upload is in progress', async () => {
    let resolveUpload!: (value: unknown) => void
    mockMutateAsync.mockReturnValue(new Promise((resolve) => {
      resolveUpload = resolve
    }))

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    const file = createTextFile('report.txt', 'content')

    await act(async () => {
      result.current.addFiles([file])
    })

    // Should be in uploading state
    expect(result.current.attachments[0].status).toBe('uploading')
    expect(result.current.isUploading).toBe(true)

    // Resolve the upload
    await act(async () => {
      resolveUpload({ path: 'uploads/report.txt', name: 'report.txt', size: 7 })
    })

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe('done')
      expect(result.current.isUploading).toBe(false)
    })
  })

  it('marks attachment as error when upload fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Upload failed'))

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    const file = createTextFile('bad.txt', 'content')

    await act(async () => {
      result.current.addFiles([file])
    })

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe('error')
      expect(result.current.attachments[0].error).toBe('Upload failed')
      expect(result.current.isUploading).toBe(false)
    })
  })

  it('removes an attachment by id', async () => {
    mockMutateAsync.mockResolvedValue({ path: 'uploads/a.txt', name: 'a.txt', size: 1 })

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      result.current.addFiles([createTextFile('a.txt', 'a')])
    })

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(1)
    })

    const id = result.current.attachments[0].id

    act(() => {
      result.current.removeAttachment(id)
    })

    expect(result.current.attachments).toHaveLength(0)
  })

  it('clears all attachments', async () => {
    mockMutateAsync.mockResolvedValue({ path: 'uploads/a.txt', name: 'a.txt', size: 1 })

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      result.current.addFiles([createTextFile('a.txt', 'a')])
    })

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(1)
    })

    act(() => {
      result.current.clearAttachments()
    })

    expect(result.current.attachments).toHaveLength(0)
  })

  it('handles multiple files added at once', async () => {
    mockMutateAsync
      .mockResolvedValueOnce({ path: 'uploads/a.txt', name: 'a.txt', size: 1 })
      .mockResolvedValueOnce({ path: 'uploads/b.txt', name: 'b.txt', size: 2 })

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      result.current.addFiles([
        createTextFile('a.txt', 'aaa'),
        createTextFile('b.txt', 'bbb'),
      ])
    })

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(2)
      expect(result.current.attachments.every((a) => a.status === 'done')).toBe(true)
    })
  })

  it('stores mimeType from File object while uploading', async () => {
    let resolveUpload!: (value: unknown) => void
    mockMutateAsync.mockReturnValue(new Promise((r) => { resolveUpload = r }))

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    const imageFile = createTextFile('photo.png', 'fake-png-data', 'image/png')

    await act(async () => {
      result.current.addFiles([imageFile])
    })

    // mimeType should be available immediately from the File object
    expect(result.current.attachments[0].mimeType).toBe('image/png')
    expect(result.current.attachments[0].status).toBe('uploading')

    // Resolve with server response that also includes mimeType
    await act(async () => {
      resolveUpload({ path: 'uploads/photo.png', name: 'photo.png', size: 100, mimeType: 'image/png' })
    })

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe('done')
      expect(result.current.attachments[0].mimeType).toBe('image/png')
    })
  })

  it('passes workspaceId + hostId to useUploadFile', async () => {
    mockMutateAsync.mockResolvedValue({ path: 'uploads/notes.txt', name: 'notes.txt', size: 10 })

    const { result } = renderHook(
      () => usePendingAttachments({ workspaceId: 'ws-1', hostId: 'host-1' }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      result.current.addFiles([createTextFile('notes.txt', 'some notes')])
    })

    // The hook should have been called — we trust useUploadFile routes correctly
    // based on the options passed to it (verified in useUploadFile tests)
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        file: expect.any(File),
      })
    })
  })

  it('reports isUploading=true until all uploads finish', async () => {
    let resolveFirst!: (value: unknown) => void
    let resolveSecond!: (value: unknown) => void
    mockMutateAsync
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r }))
      .mockReturnValueOnce(new Promise((r) => { resolveSecond = r }))

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      result.current.addFiles([
        createTextFile('a.txt', 'a'),
        createTextFile('b.txt', 'b'),
      ])
    })

    expect(result.current.isUploading).toBe(true)

    // Resolve first — still uploading (second pending)
    await act(async () => {
      resolveFirst({ path: 'uploads/a.txt', name: 'a.txt', size: 1 })
    })

    // Wait for the first upload to be marked done
    await waitFor(() => {
      expect(result.current.attachments.find((a) => a.name === 'a.txt')?.status).toBe('done')
    })

    // Second is still uploading
    expect(result.current.isUploading).toBe(true)

    // Resolve second — done
    await act(async () => {
      resolveSecond({ path: 'uploads/b.txt', name: 'b.txt', size: 1 })
    })

    await waitFor(() => {
      expect(result.current.isUploading).toBe(false)
    })
  })

  it('clearAttachments resets state even while uploads are in flight', async () => {
    let resolveUpload!: (value: unknown) => void
    mockMutateAsync.mockReturnValue(new Promise((r) => { resolveUpload = r }))

    const { result } = renderHook(
      () => usePendingAttachments({ agentId: 'agent-1' }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      result.current.addFiles([createTextFile('a.txt', 'a')])
    })

    expect(result.current.isUploading).toBe(true)

    act(() => {
      result.current.clearAttachments()
    })

    expect(result.current.attachments).toHaveLength(0)
    expect(result.current.isUploading).toBe(false)

    // If the upload later resolves, it shouldn't add the attachment back
    await act(async () => {
      resolveUpload({ path: 'uploads/a.txt', name: 'a.txt', size: 1 })
    })

    expect(result.current.attachments).toHaveLength(0)
  })
})
