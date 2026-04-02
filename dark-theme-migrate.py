"""Starlight Dark Theme Migration — Batch Color Replacement"""
import os, re

ROOT = r"C:\Users\mateusz.garwacki\Downloads\starlight-web\src"

# Order matters: longer patterns first to avoid partial matches
REPLACEMENTS = [
    # ── Backgrounds: gray scale → surface tokens ──
    (r'\bbg-gray-900\b', 'bg-surface-top'),
    (r'\bbg-gray-800\b', 'bg-surface-top'),
    (r'\bbg-gray-700\b', 'bg-surface-bright'),
    (r'\bbg-gray-600\b', 'bg-surface-bright'),
    (r'\bbg-gray-400\b', 'bg-surface-bright'),
    (r'\bbg-gray-300\b', 'bg-surface-top'),
    (r'\bbg-gray-200\b', 'bg-surface-hi'),
    (r'\bbg-gray-100\b', 'bg-surface-mid'),
    (r'\bbg-gray-50\b',  'bg-surface-dim'),
    (r'\bbg-white\b',    'bg-surface'),
    (r'\bbg-starlight-bg\b', 'bg-base'),

    # ── Backgrounds: Tailwind built-in light tints → dark-safe ──
    (r'\bbg-red-50\b',    'bg-starlight-red/10'),
    (r'\bbg-red-100\b',   'bg-starlight-red/15'),
    (r'\bbg-red-300\b',   'bg-starlight-red/30'),
    (r'\bbg-red-500\b',   'bg-starlight-red'),
    (r'\bbg-red-600\b',   'bg-starlight-red'),
    (r'\bbg-red-700\b',   'bg-starlight-red'),
    (r'\bbg-red-800\b',   'bg-starlight-red'),
    (r'\bbg-amber-50\b',  'bg-starlight-amber/10'),
    (r'\bbg-amber-100\b', 'bg-starlight-amber/15'),
    (r'\bbg-amber-300\b', 'bg-starlight-amber/30'),
    (r'\bbg-amber-400\b', 'bg-starlight-amber'),
    (r'\bbg-amber-500\b', 'bg-starlight-amber'),
    (r'\bbg-amber-600\b', 'bg-starlight-amber'),
    (r'\bbg-green-50\b',  'bg-starlight-green/10'),
    (r'\bbg-green-100\b', 'bg-starlight-green/15'),
    (r'\bbg-green-400\b', 'bg-starlight-green'),
    (r'\bbg-green-500\b', 'bg-starlight-green'),
    (r'\bbg-green-600\b', 'bg-starlight-green'),
    (r'\bbg-green-700\b', 'bg-starlight-green'),
    (r'\bbg-green-800\b', 'bg-starlight-green'),
    (r'\bbg-blue-50\b',   'bg-navy/10'),
    (r'\bbg-blue-100\b',  'bg-navy/15'),
    (r'\bbg-blue-400\b',  'bg-navy'),
    (r'\bbg-blue-600\b',  'bg-navy'),
    (r'\bbg-blue-700\b',  'bg-navy'),
    (r'\bbg-blue-800\b',  'bg-navy'),
    (r'\bbg-purple-50\b',  'bg-phase-2/10'),
    (r'\bbg-purple-100\b', 'bg-phase-2/15'),
    (r'\bbg-purple-400\b', 'bg-phase-2'),
    (r'\bbg-orange-400\b', 'bg-starlight-amber'),

    # ── Text: gray scale → semantic tokens ──
    (r'\btext-gray-900\b', 'text-foreground'),
    (r'\btext-gray-800\b', 'text-foreground'),
    (r'\btext-gray-700\b', 'text-foreground'),
    (r'\btext-gray-600\b', 'text-muted'),
    (r'\btext-gray-500\b', 'text-muted'),
    (r'\btext-gray-400\b', 'text-muted'),
    (r'\btext-gray-300\b', 'text-faint'),
    (r'\btext-gray-200\b', 'text-faint'),

    # ── Text: Tailwind built-in → starlight status tokens ──
    (r'\btext-red-400\b',    'text-starlight-red'),
    (r'\btext-red-500\b',    'text-starlight-red'),
    (r'\btext-red-600\b',    'text-starlight-red'),
    (r'\btext-red-700\b',    'text-starlight-red'),
    (r'\btext-amber-300\b',  'text-starlight-amber'),
    (r'\btext-amber-400\b',  'text-starlight-amber'),
    (r'\btext-amber-500\b',  'text-starlight-amber'),
    (r'\btext-amber-600\b',  'text-starlight-amber'),
    (r'\btext-amber-700\b',  'text-starlight-amber'),
    (r'\btext-amber-800\b',  'text-starlight-amber'),
    (r'\btext-green-400\b',  'text-starlight-green'),
    (r'\btext-green-500\b',  'text-starlight-green'),
    (r'\btext-green-600\b',  'text-starlight-green'),
    (r'\btext-green-700\b',  'text-starlight-green'),
    (r'\btext-green-800\b',  'text-starlight-green'),
    (r'\btext-blue-400\b',   'text-navy'),
    (r'\btext-blue-500\b',   'text-navy'),
    (r'\btext-blue-600\b',   'text-navy'),
    (r'\btext-blue-700\b',   'text-navy'),
    (r'\btext-purple-600\b', 'text-phase-2'),
    (r'\btext-purple-700\b', 'text-phase-2'),
    (r'\btext-orange-400\b', 'text-starlight-amber'),
    (r'\btext-orange-500\b', 'text-starlight-amber'),
    (r'\btext-orange-700\b', 'text-starlight-amber'),

    # ── Borders: gray scale → subtle ──
    (r'\bborder-gray-400\b', 'border-subtle'),
    (r'\bborder-gray-300\b', 'border-subtle'),
    (r'\bborder-gray-200\b', 'border-subtle'),
    (r'\bborder-gray-100\b', 'border-subtle'),
    (r'\bborder-gray-50\b',  'border-subtle'),

    # ── Borders: Tailwind built-in → starlight tokens ──
    (r'\bborder-red-200\b',    'border-starlight-red/20'),
    (r'\bborder-amber-200\b',  'border-starlight-amber/20'),
    (r'\bborder-amber-300\b',  'border-starlight-amber/30'),
    (r'\bborder-green-200\b',  'border-starlight-green/20'),
    (r'\bborder-blue-200\b',   'border-navy/20'),
    (r'\bborder-blue-100\b',   'border-navy/15'),
    (r'\bborder-purple-300\b', 'border-phase-2/30'),

    # ── Dividers ──
    (r'\bdivide-gray-100\b', 'divide-subtle'),
    (r'\bdivide-gray-50\b',  'divide-subtle'),
]

# Compile regex patterns once
compiled = [(re.compile(pat), repl) for pat, repl in REPLACEMENTS]

count = 0
files_changed = 0

for dirpath, dirnames, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.endswith('.tsx'):
            continue
        fpath = os.path.join(dirpath, fn)
        with open(fpath, 'r', encoding='utf-8') as f:
            original = f.read()
        
        text = original
        for regex, repl in compiled:
            text = regex.sub(repl, text)
        
        if text != original:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(text)
            files_changed += 1
            # count changes
            for regex, repl in compiled:
                count += len(regex.findall(original))

print(f"Done: {files_changed} files modified, ~{count} replacements")
