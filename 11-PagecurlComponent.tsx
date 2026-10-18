/**
 * Pagecurl - 3D PDF Flipbook
 * Renders any PDF as an interactive 3D flipbook.
 *
 * The pdf.js library (v3.11.174, Apache-2.0) and its worker are bundled
 * directly above this component in the generated code file, and the worker
 * runs from a Blob URL built from that bundled source. No remote code is
 * loaded at runtime.
 */
const PAGECURL_VERSION = "1.0.1"
import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

const { useEffect, useMemo, useRef, useState } = React

function loadPdfjs(): Promise<any> {
    // pdf.js is bundled above this component in the generated code file and
    // its worker was configured at module load, so the library is already here.
    const lib = typeof window !== "undefined" ? (window as any).pdfjsLib : null
    if (lib) return Promise.resolve(lib)
    return Promise.reject(new Error("The bundled PDF engine failed to initialize"))
}

type Status = "empty" | "loading" | "ready" | "error"

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function Pagecurl(props: any) {
    const {
        pdf,
        pdfUrl,
        accent = "#FF6A3D",
        background = "#F4F1EA",
        showToolbar = true,
        startPage = 1,
        enableZoom = true,
        enableFullscreen = true,
        rtl = false,
        style,
    } = props

    const src = (typeof pdf === "string" && pdf) || pdfUrl || ""
    const [status, setStatus] = useState<Status>(src ? "loading" : "empty")
    const [error, setError] = useState("")
    const [progress, setProgress] = useState(0)
    const [doc, setDoc] = useState<any>(null)
    const [pageCount, setPageCount] = useState(0)
    const [pageAspect, setPageAspect] = useState(0.7071) // A-series portrait w/h
    const [images, setImages] = useState<Record<number, string>>({})
    const [flipped, setFlipped] = useState(0)
    const [dragAngle, setDragAngle] = useState<number | null>(null)
    const [zoom, setZoom] = useState(1)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const stageRef = useRef<HTMLDivElement | null>(null)
    const renderQueue = useRef(Promise.resolve())
    const cache = useRef(new Map<number, string>())
    const dragRef = useRef<{ sheet: number; startX: number; dx: number; dir: 1 | -1 } | null>(null)
    const [stageSize, setStageSize] = useState({ w: 0, h: 0 })

    const sheetCount = Math.max(1, Math.ceil(pageCount / 2))

    // Load the document
    useEffect(() => {
        let cancelled = false
        cache.current.clear()
        setImages({})
        setDoc(null)
        setPageCount(0)
        setFlipped(clamp(Math.floor((startPage - 1) / 2), 0, 1e9))
        if (!src) {
            setStatus("empty")
            return
        }
        setStatus("loading")
        setProgress(0)
        loadPdfjs()
            .then(lib => {
                const task = lib.getDocument({ url: src })
                task.onProgress = (p: any) => {
                    if (p && p.total) setProgress(Math.round((p.loaded / p.total) * 100))
                }
                return task.promise
            })
            .then(async (pdfDoc: any) => {
                if (cancelled) return
                const first = await pdfDoc.getPage(1)
                const vp = first.getViewport({ scale: 1 })
                if (cancelled) return
                setPageAspect(vp.width / vp.height)
                setPageCount(pdfDoc.numPages)
                setDoc(pdfDoc)
                setStatus("ready")
            })
            .catch((e: any) => {
                if (cancelled) return
                setError(e && e.message ? String(e.message) : "Could not open this PDF")
                setStatus("error")
            })
        return () => {
            cancelled = true
        }
    }, [src])

    // Render pages lazily around the visible window
    useEffect(() => {
        if (!doc) return
        const current = flipped * 2
        const wanted: number[] = []
        for (let p = current - 2; p <= current + 5; p++) {
            if (p >= 1 && p <= pageCount) wanted.push(p)
        }
        const missing = wanted.filter(p => !cache.current.has(p))
        if (missing.length === 0) return
        renderQueue.current = renderQueue.current.then(async () => {
            for (const pageNumber of missing) {
                if (cache.current.has(pageNumber)) continue
                try {
                    const page = await doc.getPage(pageNumber)
                    const base = page.getViewport({ scale: 1 })
                    const scale = 1100 / base.width
                    const viewport = page.getViewport({ scale })
                    const canvas = document.createElement("canvas")
                    canvas.width = Math.ceil(viewport.width)
                    canvas.height = Math.ceil(viewport.height)
                    const ctx = canvas.getContext("2d")
                    if (!ctx) continue
                    await page.render({ canvasContext: ctx, viewport }).promise
                    const url = canvas.toDataURL("image/jpeg", 0.86)
                    cache.current.set(pageNumber, url)
                    setImages(prev => ({ ...prev, [pageNumber]: url }))
                } catch {
                    // A single failed page renders as a blank sheet; keep going.
                }
            }
        })
    }, [doc, flipped, pageCount])

    // Fit the book to its frame
    useEffect(() => {
        const el = stageRef.current
        if (!el || typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(entries => {
            const r = entries[0].contentRect
            setStageSize({ w: r.width, h: r.height })
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [status])

    // Fullscreen tracking
    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
        document.addEventListener("fullscreenchange", onChange)
        return () => document.removeEventListener("fullscreenchange", onChange)
    }, [])

    const flipForward = () => setFlipped(f => clamp(f + 1, 0, sheetCount))
    const flipBack = () => setFlipped(f => clamp(f - 1, 0, sheetCount))

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") rtl ? flipBack() : flipForward()
            if (e.key === "ArrowLeft") rtl ? flipForward() : flipBack()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [rtl, sheetCount])

    const pageW = 520 // natural single-page width in px (pre-scale)
    const pageH = pageW / pageAspect
    const fit = stageSize.w > 0 && stageSize.h > 0 ? Math.min(stageSize.w / (pageW * 2), stageSize.h / pageH) : 0.5
    const scale = clamp(fit, 0.05, 3) * (enableZoom ? zoom : 1)

    // Pointer drag flipping
    const onPointerDown = (e: any, sheet: number, dir: 1 | -1) => {
        if (status !== "ready") return
        if (dir === 1 && sheet !== flipped) return
        if (dir === -1 && sheet !== flipped - 1) return
        dragRef.current = { sheet, startX: e.clientX, dx: 0, dir }
        setDragAngle(dir === 1 ? 0 : -180)
        e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: any) => {
        const d = dragRef.current
        if (!d) return
        d.dx = e.clientX - d.startX
        const span = Math.max(120, pageW * scale)
        const raw = clamp((Math.abs(d.dx) / span) * 180, 0, 180)
        const forward = rtl ? d.dx > 0 : d.dx < 0
        if (d.dir === 1) setDragAngle(forward ? -raw : 0)
        else setDragAngle(forward ? -180 : -180 + raw)
    }
    const onPointerUp = () => {
        const d = dragRef.current
        if (!d) return
        const angle = dragAngle
        dragRef.current = null
        setDragAngle(null)
        if (angle === null) return
        if (d.dir === 1) {
            if (angle < -45) flipForward()
        } else if (angle > -135) flipBack()
    }

    const sheets: any[] = []
    for (let i = 0; i < sheetCount; i++) {
        const frontPage = i * 2 + 1
        const backPage = i * 2 + 2
        const isFlipped = i < flipped
        const isDragging = dragAngle !== null && dragRef.current && dragRef.current.sheet === i
        const angle = isDragging ? (dragAngle as number) : isFlipped ? -180 : 0
        const flipProgress = Math.abs(angle) / 180
        sheets.push(
            <div
                key={i}
                onPointerDown={(e: any) => onPointerDown(e, i, i === flipped ? 1 : -1)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                    position: "absolute",
                    top: 0,
                    left: rtl ? 0 : "50%",
                    width: "50%",
                    height: "100%",
                    transformStyle: "preserve-3d",
                    transformOrigin: rtl ? "right center" : "left center",
                    transform: `rotateY(${(rtl ? -1 : 1) * angle}deg)`,
                    transition: isDragging ? "none" : "transform 0.65s cubic-bezier(0.32, 0.72, 0.24, 1)",
                    zIndex: isFlipped ? i + 1 : sheetCount - i + 1,
                    cursor: i === flipped || i === flipped - 1 ? "grab" : "default",
                    touchAction: "pan-y",
                }}
            >
                {[
                    { page: frontPage, back: false },
                    { page: backPage, back: true },
                ].map(face => (
                    <div
                        key={face.back ? "b" : "f"}
                        style={{
                            position: "absolute",
                            inset: 0,
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                            transform: face.back ? "rotateY(180deg)" : "none",
                            background: "#fff",
                            overflow: "hidden",
                            boxShadow: "0 2px 14px rgba(15,12,8,0.18)",
                        }}
                    >
                        {face.page <= pageCount && images[face.page] ? (
                            <img
                                src={images[face.page]}
                                alt={`Page ${face.page}`}
                                draggable={false}
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }}
                            />
                        ) : (
                            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#fafafa,#ececec)" }} />
                        )}
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                pointerEvents: "none",
                                background: face.back
                                    ? `linear-gradient(to ${rtl ? "left" : "right"}, rgba(0,0,0,${0.22 * flipProgress}), transparent 45%)`
                                    : `linear-gradient(to ${rtl ? "right" : "left"}, rgba(0,0,0,${0.22 * (1 - Math.abs(1 - flipProgress))}), transparent 45%)`,
                            }}
                        />
                    </div>
                ))}
            </div>
        )
    }

    const coverShift = flipped === 0 ? (rtl ? 1 : -1) * (pageW / 2) : flipped >= sheetCount ? (rtl ? -1 : 1) * (pageW / 2) : 0
    const leftPage = flipped === 0 ? 1 : clamp(flipped * 2, 1, pageCount)
    const rightPage = flipped === 0 ? 0 : clamp(flipped * 2 + 1, 0, pageCount)
    const pageLabel =
        pageCount > 0
            ? flipped === 0 || flipped >= sheetCount
                ? `${leftPage} of ${pageCount}`
                : `${leftPage} - ${rightPage} of ${pageCount}`
            : ""

    const iconBtn: any = {
        border: "none",
        background: "rgba(16,16,20,0.72)",
        color: "#fff",
        width: 34,
        height: 34,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: 15,
        backdropFilter: "blur(6px)",
    }

    let body: any = null
    if (status === "empty") {
        body = (
            <div style={centerCard(background)}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>&#128196;</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>3D PDF Flipbook</div>
                <div style={{ opacity: 0.6, fontSize: 13 }}>Add a PDF in the properties panel to build your flipbook.</div>
            </div>
        )
    } else if (status === "loading") {
        body = (
            <div style={centerCard(background)}>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>Preparing your flipbook</div>
                <div style={{ width: 180, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.1)", overflow: "hidden" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: accent, transition: "width .2s" }} />
                </div>
                <div style={{ opacity: 0.55, fontSize: 12, marginTop: 8 }}>{progress}%</div>
            </div>
        )
    } else if (status === "error") {
        body = (
            <div style={centerCard(background)}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Could not open this PDF</div>
                <div style={{ opacity: 0.6, fontSize: 13, maxWidth: 320, textAlign: "center" }}>
                    {error}. Check the link is public and allows cross-origin access, or upload the PDF directly in the
                    properties panel.
                </div>
            </div>
        )
    } else {
        body = (
            <>
                <div ref={stageRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                    <div
                        style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            width: pageW * 2,
                            height: pageH,
                            transformOrigin: "center center",
                            transform: `translate(-50%, -50%) scale(${scale}) translateX(${coverShift}px)`,
                            transition: dragAngle === null ? "transform 0.45s cubic-bezier(0.32, 0.72, 0.24, 1)" : "none",
                            perspective: 2400,
                            filter: "drop-shadow(0 18px 40px rgba(15,12,8,0.28))",
                        }}
                    >
                        <div style={{ position: "absolute", inset: 0, background: flipped > 0 && flipped < sheetCount ? "#fff" : "transparent", boxShadow: flipped > 0 && flipped < sheetCount ? "inset 0 0 0 1px rgba(0,0,0,0.06)" : "none" }}>
                            {pageCount === 1 && images[1] && <img src={images[1]} style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
                        </div>
                        {pageCount > 1 && sheets}
                        <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(0,0,0,0.08)", zIndex: sheetCount + 2, pointerEvents: "none" }} />
                    </div>
                </div>
                {showToolbar && (
                    <div style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", display: "flex", gap: 8, alignItems: "center", zIndex: 999 }}>
                        <button style={iconBtn} onClick={() => (rtl ? flipForward() : flipBack())} aria-label="Previous page">&#8592;</button>
                        <div style={{ ...iconBtn, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 600 }}>{pageLabel}</div>
                        <button style={iconBtn} onClick={() => (rtl ? flipBack() : flipForward())} aria-label="Next page">&#8594;</button>
                        {enableZoom && (
                            <button style={{ ...iconBtn, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 600 }} onClick={() => setZoom(z => (z >= 3 ? 1 : z + 0.5))}>
                                {Math.round(zoom * 100)}%
                            </button>
                        )}
                        {enableFullscreen && (
                            <button
                                style={iconBtn}
                                aria-label="Fullscreen"
                                onClick={() => {
                                    const el = wrapperRef.current
                                    if (!el) return
                                    if (isFullscreen) document.exitFullscreen?.()
                                    else el.requestFullscreen?.()
                                }}
                            >
                                {isFullscreen ? "\u2715" : "\u26F6"}
                            </button>
                        )}
                    </div>
                )}
            </>
        )
    }

    return (
        <div
            ref={wrapperRef}
            style={{
                ...style,
                position: "relative",
                width: "100%",
                height: "100%",
                minHeight: 320,
                overflow: "hidden",
                background,
                fontFamily: "Inter, -apple-system, sans-serif",
                color: "#16161a",
            }}
        >
            {body}
        </div>
    )
}

const centerCard = (background: string): any => ({
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background,
    padding: 24,
    textAlign: "center",
})

addPropertyControls(Pagecurl, {
    pdf: { type: ControlType.File, title: "PDF file", allowedTypes: ["pdf"] },
    pdfUrl: { type: ControlType.String, title: "or PDF URL", placeholder: "https://example.com/document.pdf" },
    startPage: { type: ControlType.Number, title: "Start page", min: 1, max: 999, step: 1, defaultValue: 1 },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: "#FF6A3D" },
    background: { type: ControlType.Color, title: "Background", defaultValue: "#F4F1EA" },
    showToolbar: { type: ControlType.Boolean, title: "Toolbar", defaultValue: true },
    enableZoom: { type: ControlType.Boolean, title: "Zoom", defaultValue: true },
    enableFullscreen: { type: ControlType.Boolean, title: "Fullscreen", defaultValue: true },
    rtl: { type: ControlType.Boolean, title: "Right to left", defaultValue: false },
})
