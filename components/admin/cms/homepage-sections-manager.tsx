'use client';

import React, { useState } from 'react';
import {
  Layout,
  MoveUp,
  MoveDown,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  RefreshCw,
  Edit2,
  Sparkles,
} from 'lucide-react';
import type { HomepageSection } from '@/types/cms';
import { updateHomepageSection } from '@/lib/cms/admin-actions';

interface HomepageSectionsManagerProps {
  initialSections: HomepageSection[];
}

export function HomepageSectionsManager({ initialSections }: HomepageSectionsManagerProps) {
  const [sections, setSections] = useState<HomepageSection[]>(initialSections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const startEditing = (section: HomepageSection) => {
    setEditingId(section.id);
    setEditTitle(section.title || '');
    setEditSubtitle(section.subtitle || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (section: HomepageSection) => {
    setIsSubmitting(true);
    try {
      const res = await updateHomepageSection(section.id, {
        sectionKey: section.sectionKey,
        title: editTitle,
        subtitle: editSubtitle,
        displayOrder: section.displayOrder,
        isEnabled: section.isEnabled,
      });

      if (res.success) {
        setSections((prev) =>
          prev.map((s) =>
            s.id === section.id
              ? { ...s, title: editTitle, subtitle: editSubtitle }
              : s
          )
        );
        setEditingId(null);
        setStatusMessage(`Updated section '${section.sectionKey}' successfully.`);
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        alert(res.error || 'Failed to update section.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEnable = async (section: HomepageSection) => {
    const nextState = !section.isEnabled;
    const res = await updateHomepageSection(section.id, {
      sectionKey: section.sectionKey,
      isEnabled: nextState,
    });

    if (res.success) {
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, isEnabled: nextState } : s))
      );
    } else {
      alert(res.error || 'Failed to toggle section visibility.');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === sections.length - 1)) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newSections = [...sections];
    const current = newSections[index];
    const target = newSections[targetIndex];

    const currentOrder = current.displayOrder;
    const targetOrder = target.displayOrder;

    current.displayOrder = targetOrder;
    target.displayOrder = currentOrder;

    newSections[index] = target;
    newSections[targetIndex] = current;
    setSections(newSections);

    // Persist reorder to database
    await Promise.all([
      updateHomepageSection(current.id, { sectionKey: current.sectionKey, displayOrder: current.displayOrder }),
      updateHomepageSection(target.id, { sectionKey: target.sectionKey, displayOrder: target.displayOrder }),
    ]);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {statusMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 flex items-start gap-3.5">
        <Sparkles className="h-5 w-5 text-luxury-gold shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-400 leading-relaxed">
          <strong className="text-white block mb-0.5">Homepage Section Layout Control:</strong>
          Toggle storefront sections on or off instantly. Reorder the layout sequence without modifying code.
          Active sections render on the live customer storefront immediately upon save.
        </div>
      </div>

      <div className="space-y-3">
        {sections.map((section, index) => {
          const isEditing = editingId === section.id;

          return (
            <div
              key={section.id}
              className={`p-5 rounded-lg border transition-all ${
                section.isEnabled
                  ? 'bg-neutral-900/80 border-neutral-800'
                  : 'bg-neutral-950/60 border-neutral-850 opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Order Controls */}
                  <div className="flex flex-col gap-1 items-center">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'up')}
                      className="p-1 text-neutral-400 hover:text-white disabled:opacity-20 transition-colors"
                      title="Move Up"
                    >
                      <MoveUp className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold text-luxury-gold px-1.5 py-0.5 bg-neutral-950 rounded border border-neutral-800">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      disabled={index === sections.length - 1}
                      onClick={() => handleMove(index, 'down')}
                      className="p-1 text-neutral-400 hover:text-white disabled:opacity-20 transition-colors"
                      title="Move Down"
                    >
                      <MoveDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Section Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-luxury-gold font-semibold uppercase tracking-wider">
                        {section.sectionKey}
                      </span>
                      {section.isEnabled ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Visible
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-neutral-800 text-neutral-400">
                          Hidden
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Section Title"
                          className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                        />
                        <input
                          type="text"
                          value={editSubtitle}
                          onChange={(e) => setEditSubtitle(e.target.value)}
                          placeholder="Section Subtitle"
                          className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-300 focus:outline-none focus:border-luxury-gold"
                        />
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleSaveEdit(section)}
                            className="px-3 py-1 bg-luxury-gold text-neutral-950 rounded text-xs font-semibold hover:bg-luxury-gold-light"
                          >
                            Save Changes
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="px-3 py-1 bg-neutral-800 text-neutral-300 rounded text-xs hover:bg-neutral-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-base font-serif font-bold text-white">
                          {section.title || 'Untitled Section'}
                        </h3>
                        {section.subtitle && (
                          <p className="text-xs text-neutral-400">{section.subtitle}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Action Controls */}
                {!isEditing && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEditing(section)}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                      title="Edit Title & Subtitle"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleEnable(section)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        section.isEnabled ? 'bg-luxury-gold' : 'bg-neutral-800'
                      }`}
                      title={section.isEnabled ? 'Hide on storefront' : 'Show on storefront'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          section.isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
