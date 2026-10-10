'use client';

import React, { useState, useTransition } from 'react';
import { Layers, Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  type CategoryWithProductCount,
  createCategoryAction,
  updateCategoryAction,
  toggleCategoryActiveAction,
  deleteCategoryAction,
  generateCategorySlug,
} from '@/lib/catalog/categories';

interface CategoriesManagerProps {
  initialCategories: CategoryWithProductCount[];
}

export function CategoriesManager({ initialCategories }: CategoriesManagerProps) {
  const [categories, setCategories] = useState<CategoryWithProductCount[]>(initialCategories);
  const [isPending, startTransition] = useTransition();

  // Modal / Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    imageUrl: '',
    displayOrder: 0,
    isActive: true,
  });
  const [slugManual, setSlugManual] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  function resetForm() {
    setEditingId(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      imageUrl: '',
      displayOrder: categories.length + 1,
      isActive: true,
    });
    setSlugManual(false);
    setErrorMessage(null);
  }

  function handleOpenCreate() {
    resetForm();
    setModalOpen(true);
  }

  function handleOpenEdit(cat: CategoryWithProductCount) {
    setEditingId(cat.id);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      imageUrl: cat.imageUrl || '',
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
    });
    setSlugManual(true);
    setErrorMessage(null);
    setModalOpen(true);
  }

  async function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: !slugManual ? name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') : prev.slug,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      if (editingId) {
        const res = await updateCategoryAction(editingId, {
          name: formData.name,
          slug: formData.slug,
          description: formData.description,
          imageUrl: formData.imageUrl,
          displayOrder: Number(formData.displayOrder),
          isActive: formData.isActive,
        });

        if (!res.success) {
          setErrorMessage(res.error || 'Failed to update category');
          return;
        }

        setCategories((prev) =>
          prev.map((c) =>
            c.id === editingId
              ? {
                  ...c,
                  name: formData.name,
                  slug: formData.slug,
                  description: formData.description,
                  imageUrl: formData.imageUrl,
                  displayOrder: Number(formData.displayOrder),
                  isActive: formData.isActive,
                }
              : c
          )
        );
        setSuccessMessage(`Category "${formData.name}" updated successfully.`);
        setModalOpen(false);
      } else {
        const res = await createCategoryAction({
          name: formData.name,
          slug: formData.slug,
          description: formData.description,
          imageUrl: formData.imageUrl,
          displayOrder: Number(formData.displayOrder),
          isActive: formData.isActive,
        });

        if (!res.success || !res.category) {
          setErrorMessage(res.error || 'Failed to create category');
          return;
        }

        const newCat: CategoryWithProductCount = {
          ...res.category,
          productCount: 0,
        };

        setCategories((prev) => [...prev, newCat].sort((a, b) => a.displayOrder - b.displayOrder));
        setSuccessMessage(`Category "${formData.name}" created successfully.`);
        setModalOpen(false);
      }
    });
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    const newStatus = !currentStatus;
    startTransition(async () => {
      const res = await toggleCategoryActiveAction(id, newStatus);
      if (res.success) {
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isActive: newStatus } : c))
        );
      } else {
        setErrorMessage(res.error || 'Failed to toggle status');
      }
    });
  }

  function handleOpenDelete(id: string) {
    setDeleteId(id);
    setDeleteConfirmOpen(true);
    setErrorMessage(null);
  }

  async function handleConfirmDelete() {
    if (!deleteId) return;

    startTransition(async () => {
      const res = await deleteCategoryAction(deleteId);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to delete category');
        setDeleteConfirmOpen(false);
        return;
      }

      setCategories((prev) => prev.filter((c) => c.id !== deleteId));
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      setSuccessMessage('Category deleted successfully.');
    });
  }

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-luxury-card p-5 rounded-md border border-luxury-border">
        <div>
          <h2 className="text-xl font-serif text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-luxury-gold" />
            Store Categories
          </h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Organize catalog pieces into customer-facing departments with display order and visibility controls.
          </p>
        </div>

        <Button
          onClick={handleOpenCreate}
          variant="gold"
          className="flex items-center gap-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            {successMessage}
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Categories Table */}
      <div className="bg-luxury-card rounded-md border border-luxury-border overflow-hidden">
        {categories.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Layers className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-1">No Categories Found</h3>
            <p className="text-sm text-neutral-400 max-w-md mx-auto mb-5">
              Categories group your jewelry (e.g. Rings, Necklaces, Bracelets) and power storefront browsing.
            </p>
            <Button onClick={handleOpenCreate} variant="gold">
              Create First Category
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-luxury-surface text-xs uppercase tracking-wider text-neutral-400 border-b border-luxury-border">
                <tr>
                  <th className="py-3 px-4 w-12">Order</th>
                  <th className="py-3 px-4">Name & Slug</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center">Products</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-luxury-border">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-luxury-surface/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-neutral-400">
                      {cat.displayOrder}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {cat.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cat.imageUrl}
                            alt={cat.name}
                            className="h-9 w-9 rounded object-cover border border-neutral-700 shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 text-luxury-gold/60">
                            <Layers className="h-4 w-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white">{cat.name}</div>
                          <div className="text-xs font-mono text-neutral-500">/{cat.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-neutral-400 max-w-xs truncate">
                      {cat.description || <span className="text-neutral-600 italic">None</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold text-white">{cat.productCount}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={cat.isActive ? 'success' : 'outline'}>
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(cat.id, cat.isActive)}
                          title={cat.isActive ? 'Deactivate Category' : 'Activate Category'}
                          className="h-8 w-8 p-0 text-neutral-400 hover:text-white"
                        >
                          {cat.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(cat)}
                          title="Edit Category"
                          className="h-8 w-8 p-0 text-neutral-400 hover:text-luxury-gold"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDelete(cat.id)}
                          title="Delete Category"
                          className="h-8 w-8 p-0 text-neutral-400 hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Category Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-luxury-border rounded-lg max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white text-lg"
            >
              ✕
            </button>

            <h3 className="text-xl font-serif text-white mb-1">
              {editingId ? 'Edit Category' : 'Create New Category'}
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Specify category details, order index, and optional promotional image URL.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Category Name <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Necklaces, Solitaire Rings"
                  required
                  className="bg-luxury-surface border-neutral-700 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  URL Slug <span className="text-rose-400">*</span>
                </label>
                <Input
                  value={formData.slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    setFormData({ ...formData, slug: e.target.value });
                  }}
                  placeholder="e.g. necklaces"
                  required
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Storefront URL: /category/{formData.slug || 'slug'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Short description displayed at the top of this category collection page..."
                  rows={3}
                  className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm p-2.5 focus:outline-none focus:border-luxury-gold/70"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Display Order
                  </label>
                  <Input
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData({ ...formData, displayOrder: Number(e.target.value) })}
                    min={0}
                    className="bg-luxury-surface border-neutral-700 text-white"
                  />
                  <span className="text-[11px] text-neutral-500 mt-1 block">Lower numbers appear first</span>
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-luxury-surface h-4 w-4"
                    />
                    <span className="text-sm text-neutral-200">Active / Visible</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Banner / Image URL (Optional)
                </label>
                <Input
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://... or uploaded image URL"
                  className="bg-luxury-surface border-neutral-700 text-white text-sm"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-luxury-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>

                <Button type="submit" variant="gold" disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? 'Save Changes' : 'Create Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-rose-500/40 rounded-lg max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-serif text-white mb-2 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              Delete Category?
            </h3>
            <p className="text-sm text-neutral-300 mb-5">
              Are you sure you want to remove this category? If any products are currently assigned to it, the database will safely prevent deletion.
            </p>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
