// Builds the A7 report page docs/A7/A7_6731503052.html from the Markdown source, with the diagram
// docs/A7/grounding.svg inlined, so that it can be printed to PDF. Same steps as for A6:
//
//   npm install --no-save marked@16.4.1    (once; marked is not a dependency of the project)
//   node docs/A7/build-report.mjs
//
// Then make the PDF: open the HTML file in a browser and use Print > Save as PDF (A4, no headers
// and footers), or on Windows with Edge:
//   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu
//     --no-pdf-header-footer --print-to-pdf=<full path>\docs\A7\A7_6731503052.pdf
//     file:///<full path>/docs/A7/A7_6731503052.html
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let marked
try {
  ;({ marked } = await import('marked'))
} catch {
  console.error('The Markdown converter is missing. Run: npm install --no-save marked@16.4.1')
  process.exit(1)
}

const here = (name) => fileURLToPath(new URL(name, import.meta.url))
const markdown = readFileSync(here('A7_6731503052.md'), 'utf8')

marked.use({ gfm: true })
let body = marked.parse(markdown)
if (existsSync(here('grounding.svg'))) {
  const svg = readFileSync(here('grounding.svg'), 'utf8').replace(
    /width="(\d+)" height="(\d+)"/,
    'style="width:100%;height:auto;max-width:960px;display:block;margin:0 auto"',
  )
  body = body.replace(/<p><img src="grounding\.svg"[^>]*><\/p>/, `<figure class="arch">${svg}</figure>`)
}

const css = `
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", "Leelawadee UI", Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #111; background: #fff; max-width: 190mm; margin: 0 auto; }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  h2 { font-size: 15pt; margin: 22pt 0 6pt; border-bottom: 1.5px solid #333; padding-bottom: 3pt; break-after: avoid; }
  h3 { font-size: 12pt; margin: 16pt 0 4pt; break-after: avoid; }
  p { margin: 5pt 0; }
  ul, ol { margin: 4pt 0 6pt; padding-left: 20pt; }
  li { margin: 2pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; }
  th, td { border: 1px solid #999; padding: 3pt 5pt; vertical-align: top; text-align: left; }
  th { background: #e9edf3; }
  tr { break-inside: avoid; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9pt; background: #f2f2f2; padding: 0 2pt; }
  pre { font-family: Consolas, "Courier New", monospace; font-size: 8.4pt; background: #f6f6f6; border: 1px solid #ccc; padding: 6pt 8pt; white-space: pre-wrap; word-break: break-word; margin: 6pt 0 10pt; }
  pre code { background: none; padding: 0; font-size: inherit; }
  figure.arch { margin: 8pt 0 12pt; break-inside: avoid; }
  a { color: #1a4d8f; text-decoration: none; }
  input[type=checkbox] { vertical-align: middle; }
`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>A7 Report 6731503052: Evaluating the Support Request Router</title>
<style>${css}</style></head>
<body>
${body}
</body></html>
`
writeFileSync(here('A7_6731503052.html'), html)
console.log(`wrote docs/A7/A7_6731503052.html (${html.length} characters)`)
