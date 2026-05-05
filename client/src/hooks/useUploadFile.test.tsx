import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUploadFile } from './useUploadFile'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

/** Helper: extract the FormData sent in a fetch call */
async function getSentFormData(call: [string, RequestInit]): Promise<FormData> {
  const body = call[1].body as FormData
  return body as FormData
}

describe('useUploadFile', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('uploads a file to an agent via multipart/form-data', async () => {
    const response = { path: 'uploads/report.txt', name: 'report.txt', size: 42 }
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    } as Response)

    const { result } = renderHook(() => useUploadFile({ agentId: 'agent-1' }), {
      wrapper: createWrapper(),
    })

    const file = new File(['Hello world'], 'report.txt', { type: 'text/plain' })

    act(() => {
      result.current.mutate({ file })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(response)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${RELAY_URL}/api/agents/agent-1/uploads`,
      expect.objectContaining({
        method: 'POST',
      }),
    )

    // Verify the body is FormData with a 'file' field
    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    const formData = await getSentFormData(call)
    expect(formData.get('file')).toBeInstanceOf(File)
    expect((formData.get('file') as File).name).toBe('report.txt')
    // No Content-Type header — browser sets it with boundary for multipart
    const headers = call[1].headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('uploads a file to a workspace via multipart/form-data (includes hostId field)', async () => {
    const response = { path: 'uploads/notes.txt', name: 'notes.txt', size: 100 }
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    } as Response)

    const { result } = renderHook(
      () => useUploadFile({ workspaceId: 'ws-1', hostId: 'host-1' }),
      { wrapper: createWrapper() },
    )

    const file = new File(['Some notes'], 'notes.txt', { type: 'text/plain' })

    act(() => {
      result.current.mutate({ file })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(response)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${RELAY_URL}/api/workspaces/ws-1/uploads`,
      expect.objectContaining({
        method: 'POST',
      }),
    )

    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    const formData = await getSentFormData(call)
    expect(formData.get('file')).toBeInstanceOf(File)
    expect((formData.get('file') as File).name).toBe('notes.txt')
    expect(formData.get('hostId')).toBe('host-1')
  })

  it('throws when neither agentId nor workspaceId+hostId is provided', async () => {
    const { result } = renderHook(() => useUploadFile({}), {
      wrapper: createWrapper(),
    })

    const file = new File(['test'], 'test.txt', { type: 'text/plain' })

    act(() => {
      result.current.mutate({ file })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Must provide agentId or (workspaceId + hostId)')
  })

  it('handles server error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'missing required field: file' }),
    } as Response)

    const { result } = renderHook(() => useUploadFile({ agentId: 'agent-1' }), {
      wrapper: createWrapper(),
    })

    const file = new File([''], 'bad.txt', { type: 'text/plain' })

    act(() => {
      result.current.mutate({ file })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('400')
  })
})