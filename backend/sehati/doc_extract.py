"""Structured extraction from uploaded files -> JSON, for the AI-facing
copy of each case document (see resolvers/documents.py)."""

from __future__ import annotations
import io
import os
from typing import Any

_IMAGE_EXTS = {"png", "jpg", "jpeg", "tiff", "tif"}


def extract_document_json(raw_bytes: bytes, ext: str) -> dict[str, Any]:
    ext = ext.lower()
    if ext == "pdf":
        text = _extract_pdf_text(raw_bytes)
        if text.strip():
            return {"kind": "pdf_text", "text": text}
        return _extract_via_textract(raw_bytes)
    elif ext == "docx":
        return {"kind": "docx_text", "text": _extract_docx_text(raw_bytes)}
    elif ext in _IMAGE_EXTS:
        return _extract_via_textract(raw_bytes)
    else:
        return {"kind": "plain_text", "text": raw_bytes.decode("utf-8", errors="ignore")}


def _extract_via_textract(raw_bytes: bytes) -> dict[str, Any]:
    import boto3

    textract = boto3.client("textract", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    resp = textract.analyze_document(
        Document={"Bytes": raw_bytes},
        FeatureTypes=["FORMS", "TABLES"],
    )
    return _blocks_to_json(resp["Blocks"])


def _blocks_to_json(blocks: list[dict]) -> dict[str, Any]:
    by_id = {b["Id"]: b for b in blocks}
    lines = [b["Text"] for b in blocks if b["BlockType"] == "LINE"]

    def _text_for(block: dict) -> str:
        words = []
        for rel in block.get("Relationships", []):
            if rel["Type"] != "CHILD":
                continue
            for cid in rel["Ids"]:
                child = by_id.get(cid)
                if child and child["BlockType"] == "WORD":
                    words.append(child["Text"])
        return " ".join(words)

    kv_pairs = {}
    for b in blocks:
        if b["BlockType"] == "KEY_VALUE_SET" and "KEY" in b.get("EntityTypes", []):
            key_text = _text_for(b)
            value_text = ""
            for rel in b.get("Relationships", []):
                if rel["Type"] == "VALUE":
                    value_block = by_id.get(rel["Ids"][0])
                    if value_block:
                        value_text = _text_for(value_block)
            if key_text:
                kv_pairs[key_text.strip()] = value_text.strip()

    return {"kind": "textract", "lines": lines, "keyValuePairs": kv_pairs}


def _extract_pdf_text(raw_bytes: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx_text(raw_bytes: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(raw_bytes))
    return "\n".join(p.text for p in doc.paragraphs)
