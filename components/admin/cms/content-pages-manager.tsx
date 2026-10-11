'use client';

import React, { useState } from 'react';
import {
  FileText,
  ExternalLink,
  Check,
  AlertCircle,
  RefreshCw,
  Search,
  Eye,
  Edit3,
} from 'lucide-react';
import type { ContentPage } from '@/types/cms';
import { updateAdminContentPage } from '@/lib/cms/admin-actions';

interface ContentPagesManagerProps {
  initialPages: ContentPage[];
}

export function ContentPagesManager({ initialPages }: ContentPagesManagerProps) {
  const [pages, setPages] = useState<ContentPage[]>(initialPages);
  const [selectedSlug, setSelectedSlug] = useState<string>(initialPages[0]?.slug || 'about');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  const currentPage = pages.find((p) => p.slug === selectedSlug) || pages[0];

  const [title, setTitle] = useState(currentPage?.title || '');
  const [content, setContent] = useState(currentPage?.content || '');
  const [metaTitle, setMetaTitle] = useState(currentPage?.metaTitle || '');
  const [metaDescription, setMetaDescription] = useState(currentPage?.metaDescription || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Switch tabs
  const handleSelectPage = (page: ContentPage) => {
    setSelectedSlug(page.slug);
    setTitle(page.title);
    setContent(page.content);
    setMetaTitle(page.metaTitle || '');
    setMetaDescription(page.metaDescription || '');
    setStatusMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Page title is required.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await updateAdminContentPage(currentPage.slug, {
        title,
        content,
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
      });

      if (res.success) {
        setPages((prev) =>
          prev.map((p) =>
            p.slug === currentPage.slug
              ? {
                  ...p,
                  title,
                  content,
                  metaTitle: metaTitle.trim() || null,
                  metaDescription: metaDescription.trim() || null,
                  updatedAt: new Date().toISOString(),
                }
              : p
          )
        );
        setStatusMessage(`Saved '${title}' successfully!`);
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        alert(res.error || 'Failed to save content page.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
      {/* Left Sidebar: Pages List */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 space-y-1.5 md:col-span-1">
        <h3 className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Informational Pages
        </h3>
        <div className="space-y-1">
          {pages.map((p) => {
            const isSelected = p.slug === selectedSlug;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => handleSelectPage(p)}
                className={`w-full text-left px-3 py-2.5 rounded text-xs font-medium transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-luxury-gold text-neutral-950 font-bold shadow-sm'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <span>{p.title}</span>
                <span className={`text-[10px] font-mono ${isSelected ? 'text-neutral-900' : 'text-neutral-500'}`}>
                  /{p.slug}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Content Editor */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-6 md:col-span-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif font-bold text-lg text-white">{currentPage?.title}</h2>
              <span className="text-xs font-mono text-luxury-gold bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                /{currentPage?.slug}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Last updated: {new Date(currentPage?.updatedAt).toLocaleDateString('en-LK')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`px-3 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Preview</span>
              </button>
            </div>

            <a
              href={`/${currentPage?.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 hover:text-white rounded transition-colors"
            >
              <span>View Live</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {statusMessage && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded text-xs text-emerald-300 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{statusMessage}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Page Heading Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                SEO Meta Title
              </label>
              <input
                type="text"
                placeholder="Browser tab title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              SEO Meta Description
            </label>
            <input
              type="text"
              placeholder="Search engine preview description"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          {/* Editor or Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Page Content (Markdown)
              </label>
              <span className="text-[11px] text-neutral-500">Supports headers (#), lists, bold, and links</span>
            </div>

            {viewMode === 'edit' ? (
              <textarea
                rows={14}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-4 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono leading-relaxed focus:outline-none focus:border-luxury-gold"
              />
            ) : (
              <div className="w-full min-h-[300px] p-6 bg-neutral-950/80 border border-neutral-800 rounded prose prose-invert max-w-none text-sm text-neutral-300 space-y-3 whitespace-pre-wrap font-sans">
                {content}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-neutral-800">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-luxury-gold text-neutral-950 font-semibold rounded text-sm hover:bg-luxury-gold-light transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving Page...
                </>
              ) : (
                'Save Page Content'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
