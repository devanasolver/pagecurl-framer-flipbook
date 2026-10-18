import { framer } from "@framer/plugin"
import { useCallback, useEffect, useRef, useState } from "react"
const CODE_FILE_NAME = "Pagecurl.tsx"
const SOURCE_VERSION = "1.0.1"

// The component source and the pinned pdf.js build (v3.11.174, Apache-2.0)
// ship as plain files inside this plugin package so every byte of the
// generated code file is reviewable. They are fetched from the package and
// assembled at insert time; nothing is loaded remotely at runtime.
const ASSET_FILES = ["pdf.min.js.txt", "pdf.worker.min.js.txt", "PagecurlComponent.tsx"] as const

async function fetchAsset(name: string): Promise<string> {
    const res = await fetch(new URL(name, window.location.href))
    if (!res.ok) throw new Error(`Could not read bundled asset ${name}`)
    return res.text()
}

async function buildComponentSource(): Promise<string> {
    const [pdfLib, pdfWorker, component] = await Promise.all(ASSET_FILES.map(fetchAsset))
    return [
        "/*",
        " * Pagecurl - 3D PDF Flipbook",
        " *",
        " * This file contains the pinned pdf.js build (v3.11.174, Apache-2.0,",
        " * Mozilla Foundation) followed by the Pagecurl component. The pdf.js",
        " * worker is created from a Blob of the bundled worker source below,",
        " * so no remote JavaScript is loaded at runtime.",
        " */",
        pdfLib,
        "",
        "// Pagecurl bootstrap: run the bundled pdf.js worker from a Blob URL.",
        ";(() => {",
        "    const lib = typeof window !== \"undefined\" ? (window as any).pdfjsLib : null",
        "    if (!lib) return",
        `    const workerSource = ${JSON.stringify(pdfWorker)}`,
        "    const blob = new Blob([workerSource], { type: \"application/javascript\" })",
        "    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)",
        "})()",
        "",
        component,
    ].join("\n")
}

type Phase = "idle" | "uploading" | "inserting" | "done"

const colors = {
    text: "var(--framer-color-text, #16161a)",
    textSecondary: "var(--framer-color-text-secondary, #5c5c66)",
    textTertiary: "var(--framer-color-text-tertiary, #9a9aa3)",
    bg: "var(--framer-color-bg, #ffffff)",
    bgSecondary: "var(--framer-color-bg-secondary, #f6f6f8)",
    bgTertiary: "var(--framer-color-bg-tertiary, #ececf0)",
    divider: "var(--framer-color-divider, #e5e5ea)",
    tint: "var(--framer-color-tint, #FF6A3D)",
}

export function App() {
    const [pdfUrl, setPdfUrl] = useState("")
    const [uploadedName, setUploadedName] = useState("")
    const [startPage, setStartPage] = useState(1)
    const [rtl, setRtl] = useState(false)
    const [showToolbar, setShowToolbar] = useState(true)
    const [phase, setPhase] = useState<Phase>("idle")
    const [status, setStatus] = useState("")
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        framer.showUI({ position: "top right", width: 340, height: 560, resizable: true, minWidth: 300, minHeight: 420 })
    }, [])

    const onUpload = useCallback(async (file: File) => {
        setPhase("uploading")
        setStatus(`Uploading ${file.name} ...`)
        try {
            const asset = await framer.uploadFile(file)
            setPdfUrl(asset.url)
            setUploadedName(file.name)
            setStatus("")
        } catch (e) {
            setStatus("Upload failed. Try a PDF URL instead.")
        } finally {
            setPhase("idle")
        }
    }, [])

    const ensureCodeFile = useCallback(async () => {
        const componentSource = await buildComponentSource()
        const existing = await framer.getCodeFile(CODE_FILE_NAME)
        if (existing) {
            const content = (existing as any).content ?? ""
            if (!content.includes(`Pagecurl - 3D PDF Flipbook`) || !content.includes(SOURCE_VERSION)) {
                await existing.setFileContent(componentSource)
            }
            return existing
        }
        return framer.createCodeFile(CODE_FILE_NAME, componentSource)
    }, [])

    const onInsert = useCallback(async () => {
        if (!pdfUrl.trim()) {
            setStatus("Add a PDF URL or upload a PDF first.")
            return
        }
        setPhase("inserting")
        setStatus("Preparing the flipbook component ...")
        try {
            const file = await ensureCodeFile()
            let insertURL = ""
            for (let attempt = 0; attempt < 20 && !insertURL; attempt++) {
                const fresh = (await framer.getCodeFile((file as any).id)) ?? file
                const componentExport = fresh.exports.find(e => e.type === "component" && e.isDefaultExport)
                if (componentExport && componentExport.type === "component") insertURL = componentExport.insertURL
                if (!insertURL) await new Promise(r => setTimeout(r, 400))
            }
            if (!insertURL) throw new Error("Component is still compiling")
            await framer.addComponentInstance({
                url: insertURL,
                attributes: {
                    width: 960,
                    height: 640,
                    controls: { pdfUrl: pdfUrl.trim(), startPage, rtl, showToolbar },
                } as any,
            })
            setPhase("done")
            setStatus("Flipbook inserted. Select it to style pages, colors and controls.")
            framer.notify("Flipbook added to the canvas", { variant: "success" })
        } catch (e) {
            setPhase("idle")
            setStatus("Insert failed. Click Insert again in a moment.")
        }
    }, [pdfUrl, startPage, rtl, showToolbar, ensureCodeFile])

    const busy = phase === "uploading" || phase === "inserting"

    return (
        <main style={{ fontFamily: "Inter, -apple-system, sans-serif", color: colors.text, background: colors.bg, minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
            <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/icon.svg" width={30} height={30} style={{ borderRadius: 8 }} />
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Pagecurl</div>
                    <div style={{ color: colors.textTertiary, fontSize: 11 }}>3D PDF flipbooks, right on your canvas</div>
                </div>
            </header>

            <section style={{ background: colors.bgSecondary, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontWeight: 600 }}>PDF source</label>
                <input
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    value={pdfUrl}
                    onChange={e => {
                        setPdfUrl(e.target.value)
                        setUploadedName("")
                    }}
                    style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${colors.divider}`, background: colors.bg, color: colors.text, fontSize: 13, outline: "none" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 1, background: colors.divider }} />
                    <span style={{ color: colors.textTertiary, fontSize: 11 }}>or</span>
                    <div style={{ flex: 1, height: 1, background: colors.divider }} />
                </div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    style={{ padding: "9px 10px", borderRadius: 8, border: `1px dashed ${colors.divider}`, background: colors.bgTertiary, color: colors.text, cursor: "pointer", fontWeight: 600 }}
                >
                    {phase === "uploading" ? "Uploading ..." : uploadedName ? `Replace: ${uploadedName}` : "Upload a PDF"}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: "none" }}
                    onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) onUpload(f)
                        e.target.value = ""
                    }}
                />
                {uploadedName && <div style={{ color: colors.textSecondary, fontSize: 11 }}>Hosted in this project: {uploadedName}</div>}
            </section>

            <section style={{ background: colors.bgSecondary, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontWeight: 600 }}>Options</label>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Start on page</span>
                    <input
                        type="number"
                        min={1}
                        value={startPage}
                        onChange={e => setStartPage(Math.max(1, Number(e.target.value) || 1))}
                        style={{ width: 64, padding: "5px 8px", borderRadius: 7, border: `1px solid ${colors.divider}`, background: colors.bg, color: colors.text }}
                    />
                </div>
                <Toggle label="Page toolbar" value={showToolbar} onChange={setShowToolbar} />
                <Toggle label="Right to left reading" value={rtl} onChange={setRtl} />
                <div style={{ color: colors.textTertiary, fontSize: 11 }}>
                    Colors, zoom and fullscreen can be tuned per flipbook in the properties panel after inserting.
                </div>
            </section>

            <div style={{ flex: 1 }} />

            {status && <div style={{ color: phase === "done" ? "#1c9c5b" : colors.textSecondary, fontSize: 12 }}>{status}</div>}

            <button
                onClick={onInsert}
                disabled={busy || !pdfUrl.trim()}
                style={{
                    padding: "11px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: busy || !pdfUrl.trim() ? colors.bgTertiary : colors.tint,
                    color: busy || !pdfUrl.trim() ? colors.textTertiary : "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: busy || !pdfUrl.trim() ? "default" : "pointer",
                }}
            >
                {phase === "inserting" ? "Inserting ..." : "Insert flipbook"}
            </button>
        </main>
    )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => onChange(!value)}>
            <span>{label}</span>
            <div style={{ width: 34, height: 20, borderRadius: 10, background: value ? "var(--framer-color-tint, #FF6A3D)" : "var(--framer-color-bg-tertiary, #ececf0)", position: "relative", transition: "background .15s" }}>
                <div style={{ position: "absolute", top: 2, left: value ? 16 : 2, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
            </div>
        </div>
    )
}
