"""Plain-text extraction from uploaded files — shared by case document upload
(``resolvers/documents.py``) and the shared reference library
(``resolvers/resources.py``)."""

from __future__ import annotations

import io


def extract_document_text(raw_bytes: bytes, ext: str) -> str:
    ext = ext.lower()
    if ext == "pdf":
        return _extract_pdf_text(raw_bytes)
    elif ext == "docx":
        return _extract_docx_text(raw_bytes)
    else:
        return raw_bytes.decode("utf-8", errors="ignore")


def _extract_pdf_text(raw_bytes: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx_text(raw_bytes: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(raw_bytes))
    return "\n".join(p.text for p in doc.paragraphs)
