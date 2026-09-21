import JSZip from "jszip";

export async function createRealDocxFile(
  name: string,
  email: string,
  phone: string,
  skills: string[],
  filename: string = "resume.docx",
): Promise<File> {
  const zip = new JSZip();

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="xml" ContentType="application/xml"/>',
    '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    "</Types>",
  ].join("\n");

  const relsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    "</Relationships>",
  ].join("\n");

  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "  <w:body>",
    `    <w:p><w:r><w:t>${name}</w:t></w:r></w:p>`,
    "    <w:p><w:r><w:t>Senior Full Stack Developer</w:t></w:r></w:p>",
    `    <w:p><w:r><w:t>Email: ${email}</w:t></w:r></w:p>`,
    `    <w:p><w:r><w:t>Phone: ${phone}</w:t></w:r></w:p>`,
    "    <w:p><w:r><w:t>PROFESSIONAL SUMMARY</w:t></w:r></w:p>",
    "    <w:p><w:r><w:t>Experienced engineer building distributed systems.</w:t></w:r></w:p>",
    "    <w:p><w:r><w:t>TECHNICAL SKILLS</w:t></w:r></w:p>",
    `    <w:p><w:r><w:t>${skills.join(", ")}</w:t></w:r></w:p>`,
    "  </w:body>",
    "</w:document>",
  ].join("\n");

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", relsXml);
  zip.file("word/document.xml", documentXml);

  const buffer = await zip.generateAsync({ type: "uint8array" });
  return new File([Buffer.from(buffer)], filename, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// Generates a standard binary PDF containing text
export function createRealPdfFile(
  name: string,
  email: string,
  phone: string,
  skills: string[],
  filename: string = "resume.pdf",
): File {
  const lines = [name, `Email: ${email}`, `Phone: ${phone}`, "TECHNICAL SKILLS", skills.join(", ")];

  let stream = "BT /F1 12 Tf 50 700 Td ";
  for (const line of lines) {
    const escaped = line.replace(/[\\()]/g, "\\$&");
    stream += `(${escaped}) Tj 0 -20 Td `;
  }
  stream += "ET";

  const streamBytes = Buffer.from(stream, "utf-8");
  const streamLen = streamBytes.length;

  const pdfParts = [
    "%PDF-1.4\n",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n`,
    `4 0 obj << /Length ${streamLen} >> stream\n`,
    stream,
    "\nendstream\nendobj\n",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    "xref\n0 6\n0000000000 65535 f \n",
    "0000000009 00000 n \n",
    "0000000058 00000 n \n",
    "0000000115 00000 n \n",
    "0000000250 00000 n \n",
    `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n350\n%%EOF`,
  ];

  const fullPdfBuffer = Buffer.from(pdfParts.join(""), "utf-8");
  return new File([fullPdfBuffer], filename, { type: "application/pdf" });
}
