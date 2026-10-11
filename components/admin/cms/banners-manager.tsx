'use client';

import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  Check,
  AlertCircle,
  X,
  RefreshCw,
  Eye,
} from 'lucide-react';
import type { Banner, CreateBannerInput } from '@/types/cms';
import {
  createAdminBanner,
  updateAdminBanner,
  deleteAdminBanner,
} from '@/lib/cms/admin-actions';

interface BannersManagerProps {
  initialBanners: Banner[];
}

export function BannersManager({ initialBanners }: BannersManagerProps) {
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [mobileImageUrl, setMobileImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('/shop');
  const [buttonText, setButtonText] = useState('Explore Catalog');
  const [displayOrder, setDisplayOrder] = useState<number | ''>(0);
  const [isActive, setIsActive] = useState(true);

  const openCreateModal = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setImageUrl('');
    setMobileImageUrl('');
    setLinkUrl('/shop');
    setButtonText('Explore Catalog');
    setDisplayOrder(banners.length);
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (banner: Banner) => {
    setEditingBanner(banner);
    setTitle(banner.title);
    setSubtitle(banner.subtitle || '');
    setImageUrl(banner.imageUrl);
    setMobileImageUrl(banner.mobileImageUrl || '');
    setLinkUrl(banner.linkUrl || '/shop');
    setButtonText(banner.buttonText || 'Explore Catalog');
    setDisplayOrder(banner.displayOrder);
    setIsActive(banner.isActive);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (banner: Banner) => {
    const nextState = !banner.isActive;
    const res = await updateAdminBanner(banner.id, { isActive: nextState });
    if (res.success) {
      setBanners((prev) =>
        prev.map((b) => (b.id === banner.id ? { ...b, isActive: nextState } : b))
      );
    } else {
      alert(res.error || 'Failed to update banner status.');
    }
  };

  const handleDelete = async (banner: Banner) => {
    if (!confirm(`Are you sure you want to delete banner '${banner.title}'?`)) return;
    const res = await deleteAdminBanner(banner.id);
    if (res.success) {
      setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    } else {
      alert(res.error || 'Failed to delete banner.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Banner title is required.');
      return;
    }
    if (!imageUrl.trim()) {
      setFormError('Desktop image URL is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingBanner) {
        const res = await updateAdminBanner(editingBanner.id, {
          title,
          subtitle: subtitle.trim() || null,
          imageUrl,
          mobileImageUrl: mobileImageUrl.trim() || null,
          linkUrl: linkUrl.trim() || null,
          buttonText: buttonText.trim() || null,
          displayOrder: displayOrder === '' ? 0 : Number(displayOrder),
          isActive,
        });

        if (res.success) {
          setBanners((prev) =>
            prev.map((b) =>
              b.id === editingBanner.id
                ? {
                    ...b,
                    title,
                    subtitle: subtitle.trim() || null,
                    imageUrl,
                    mobileImageUrl: mobileImageUrl.trim() || null,
                    linkUrl: linkUrl.trim() || null,
                    buttonText: buttonText.trim() || null,
                    displayOrder: displayOrder === '' ? 0 : Number(displayOrder),
                    isActive,
                  }
                : b
            )
          );
          setIsModalOpen(false);
        } else {
          setFormError(res.error || 'Failed to update banner.');
        }
      } else {
        const input: CreateBannerInput = {
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          imageUrl: imageUrl.trim(),
          mobileImageUrl: mobileImageUrl.trim() || null,
          linkUrl: linkUrl.trim() || null,
          buttonText: buttonText.trim() || null,
          displayOrder: displayOrder === '' ? 0 : Number(displayOrder),
          isActive,
        };

        const res = await createAdminBanner(input);
        if (res.success && res.banner) {
          setBanners((prev) => [...prev, res.banner!]);
          setIsModalOpen(false);
        } else {
          setFormError(res.error || 'Failed to create banner.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          Showing {banners.length} promotional banners configured for the storefront hero section.
        </p>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-luxury-gold text-neutral-950 rounded font-semibold text-sm hover:bg-luxury-gold-light transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Banner</span>
        </button>
      </div>

      {/* Banners Grid */}
      {banners.length === 0 ? (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-12 text-center text-neutral-500">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No promotional banners created yet.</p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 text-luxury-gold rounded text-xs font-semibold hover:bg-neutral-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create First Banner</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className={`bg-neutral-900/60 border rounded-lg overflow-hidden flex flex-col transition-all ${
                banner.isActive ? 'border-neutral-800 hover:border-neutral-700' : 'border-neutral-850 opacity-60'
              }`}
            >
              {/* Image Preview */}
              <div className="relative aspect-[16/9] bg-neutral-950 flex items-center justify-center overflow-hidden border-b border-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={banner.imageUrl}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback visual on broken image URL
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/80 text-luxury-gold border border-luxury-gold/40">
                    Order #{banner.displayOrder}
                  </span>
                </div>
              </div>

              {/* Banner Details */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <h3 className="font-serif font-bold text-base text-white line-clamp-1">
                    {banner.title}
                  </h3>
                  {banner.subtitle && (
                    <p className="text-xs text-neutral-400 line-clamp-2">{banner.subtitle}</p>
                  )}
                  {banner.linkUrl && (
                    <div className="text-[11px] text-luxury-gold flex items-center gap-1 pt-1">
                      <span>Destination:</span>
                      <span className="font-mono text-neutral-300">{banner.linkUrl}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-neutral-800/80">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(banner)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        banner.isActive ? 'bg-luxury-gold' : 'bg-neutral-800'
                      }`}
                      title={banner.isActive ? 'Active on storefront' : 'Hidden'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          banner.isActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-xs text-neutral-400">
                      {banner.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(banner)}
                      className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                      title="Edit Banner"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(banner)}
                      className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors"
                      title="Delete Banner"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-luxury-gold" />
                {editingBanner ? 'Edit Promotional Banner' : 'Create New Promotional Banner'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Headline Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. The Royal Solitaire Collection"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Sub-headline / Tagline
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handcrafted fine rings with timeless gold-plated finishes"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Desktop Image URL
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://... or /images/banners/hero.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Mobile Image URL (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Optional optimized vertical image for smartphones"
                  value={mobileImageUrl}
                  onChange={(e) => setMobileImageUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    CTA Button Label
                  </label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Destination Link
                  </label>
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>

                <div className="flex items-center justify-between pt-5">
                  <span className="text-xs text-neutral-300">Active on Store</span>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isActive ? 'bg-luxury-gold' : 'bg-neutral-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded text-sm hover:bg-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-luxury-gold text-neutral-950 font-semibold rounded text-sm hover:bg-luxury-gold-light disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Banner'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
