import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PdfRendererProps {
  content: string
}

export function PdfRenderer({ content }: PdfRendererProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [rotation, setRotation] = useState(0)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setCurrentPage(1)
  }, [])

  function goToPrev() {
    setCurrentPage((p) => Math.max(1, p - 1))
  }

  function goToNext() {
    setCurrentPage((p) => Math.min(numPages, p + 1))
  }

  function zoomIn() {
    setScale((s) => Math.min(3.0, +(s + 0.25).toFixed(2)))
  }

  function zoomOut() {
    setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))
  }

  function rotate() {
    setRotation((r) => (r + 90) % 360)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-discord-border-subtle bg-discord-input px-3 py-1.5">
        {/* Page navigation */}
        <button
          type="button"
          onClick={goToPrev}
          disabled={currentPage <= 1}
          className="flex h-6 w-6 items-center justify-center rounded text-discord-text-dim transition-colors hover:bg-discord-surface-hover hover:text-discord-text disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>

        <span className="min-w-20 text-center font-mono text-[0.65rem] text-discord-text-muted">
          {numPages > 0 ? `${currentPage} / ${numPages}` : '—'}
        </span>

        <button
          type="button"
          onClick={goToNext}
          disabled={currentPage >= numPages}
          className="flex h-6 w-6 items-center justify-center rounded text-discord-text-dim transition-colors hover:bg-discord-surface-hover hover:text-discord-text disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>

        <div className="mx-2 h-4 w-px bg-discord-border-subtle" />

        {/* Zoom */}
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className="flex h-6 w-6 items-center justify-center rounded text-discord-text-dim transition-colors hover:bg-discord-surface-hover hover:text-discord-text disabled:opacity-30"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} />
        </button>

        <span className="min-w-12 text-center font-mono text-[0.65rem] text-discord-text-muted">
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= 3.0}
          className="flex h-6 w-6 items-center justify-center rounded text-discord-text-dim transition-colors hover:bg-discord-surface-hover hover:text-discord-text disabled:opacity-30"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
        </button>

        <div className="mx-2 h-4 w-px bg-discord-border-subtle" />

        {/* Rotate */}
        <button
          type="button"
          onClick={rotate}
          className="flex h-6 w-6 items-center justify-center rounded text-discord-text-dim transition-colors hover:bg-discord-surface-hover hover:text-discord-text"
          aria-label="Rotate 90°"
        >
          <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* PDF canvas */}
      <div className="min-h-0 flex-1 overflow-auto bg-[hsl(208_25%_7%)]">
        <div className="flex min-h-full items-start justify-center p-6">
          <Document
            file={content}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex h-48 items-center justify-center">
                <div className="space-y-3 text-center">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-discord-primary border-t-transparent" />
                  <p className="text-xs text-discord-text-dim">Loading PDF…</p>
                </div>
              </div>
            }
            error={
              <div className="rounded-xl border border-discord-red/40 bg-discord-red/10 px-5 py-4 text-center">
                <p className="text-sm text-discord-red">Failed to load PDF</p>
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              rotate={rotation}
              className="shadow-[0_4px_32px_-8px_rgb(0_0_0/0.6)]"
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        </div>
      </div>
    </div>
  )
}
