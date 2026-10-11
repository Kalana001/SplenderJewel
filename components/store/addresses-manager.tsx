'use client';

import React, { useState } from 'react';
import { Plus, MapPin, Phone, Home, Building2, Check, Trash2, Edit2, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SRI_LANKA_DISTRICTS, type SriLankaDistrict } from '@/lib/config/districts';
import {
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
} from '@/lib/addresses/actions';
import type { CustomerAddress, AddressInput } from '@/types/address';

interface AddressesManagerProps {
  initialAddresses: CustomerAddress[];
}

export function AddressesManager({ initialAddresses }: AddressesManagerProps) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>(initialAddresses);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [label, setLabel] = useState('Home');
  const [fullName, setFullName] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState<string>(SRI_LANKA_DISTRICTS[4]); // Default to Colombo
  const [postalCode, setPostalCode] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const openCreateModal = () => {
    setEditingAddress(null);
    setLabel('Home');
    setFullName('');
    setPhone1('');
    setPhone2('');
    setAddressLine('');
    setCity('');
    setDistrict(SRI_LANKA_DISTRICTS[4]);
    setPostalCode('');
    setDeliveryNotes('');
    setIsDefault(addresses.length === 0);
    setFeedback(null);
    setIsModalOpen(true);
  };

  const openEditModal = (addr: CustomerAddress) => {
    setEditingAddress(addr);
    setLabel(addr.label || 'Home');
    setFullName(addr.fullName);
    setPhone1(addr.phone1);
    setPhone2(addr.phone2 || '');
    setAddressLine(addr.addressLine);
    setCity(addr.city || '');
    setDistrict(addr.district);
    setPostalCode(addr.postalCode || '');
    setDeliveryNotes(addr.deliveryNotes || '');
    setIsDefault(addr.isDefault);
    setFeedback(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    const input: AddressInput = {
      label,
      fullName,
      phone1,
      phone2: phone2 || undefined,
      addressLine,
      city: city || undefined,
      district,
      postalCode: postalCode || undefined,
      deliveryNotes: deliveryNotes || undefined,
      isDefault,
    };

    try {
      if (editingAddress) {
        const res = await updateCustomerAddress(editingAddress.id, input);
        if (res.success && res.address) {
          setAddresses((prev) =>
            prev.map((a) => {
              if (a.id === editingAddress.id) return res.address!;
              if (res.address!.isDefault) return { ...a, isDefault: false };
              return a;
            })
          );
          setFeedback({ type: 'success', message: 'Address updated successfully.' });
          setIsModalOpen(false);
        } else {
          setFeedback({ type: 'error', message: res.error || 'Failed to update address.' });
        }
      } else {
        const res = await createCustomerAddress(input);
        if (res.success && res.address) {
          setAddresses((prev) => {
            const next = res.address!.isDefault
              ? prev.map((a) => ({ ...a, isDefault: false }))
              : [...prev];
            return [res.address!, ...next];
          });
          setFeedback({ type: 'success', message: 'New delivery address added successfully.' });
          setIsModalOpen(false);
        } else {
          setFeedback({ type: 'error', message: res.error || 'Failed to add address.' });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await setDefaultCustomerAddress(id);
      if (res.success) {
        setAddresses((prev) =>
          prev.map((a) => ({
            ...a,
            isDefault: a.id === id,
          }))
        );
        setFeedback({ type: 'success', message: 'Default delivery address updated.' });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to set default address.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update default address.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this delivery address?')) {
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const res = await deleteCustomerAddress(id);
      if (res.success) {
        setAddresses((prev) => {
          const filtered = prev.filter((a) => a.id !== id);
          if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
            filtered[0].isDefault = true;
          }
          return filtered;
        });
        setFeedback({ type: 'success', message: 'Address removed successfully.' });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to remove address.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to remove address.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Delivery Addresses
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Manage your saved delivery addresses across Sri Lanka for seamless 1-click checkout.
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          variant="gold"
          size="sm"
          className="gap-2 self-start sm:self-auto font-medium"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Address</span>
        </Button>
      </div>

      {/* Global alert feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-md border text-sm flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
        </div>
      )}

      {/* Address cards list */}
      {addresses.length === 0 ? (
        <Card className="border-neutral-800 bg-neutral-900/40 text-center py-12">
          <CardContent className="space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold">
              <MapPin className="h-8 w-8 stroke-[1.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-medium text-white">No saved addresses yet</h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Add your home or office address to ensure quick delivery and automatic district rate calculation.
              </p>
            </div>
            <Button onClick={openCreateModal} variant="gold" size="sm" className="mt-2 font-medium">
              <Plus className="h-4 w-4 mr-1.5" />
              Add First Address
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {addresses.map((addr) => (
            <Card
              key={addr.id}
              className={`border transition-all ${
                addr.isDefault
                  ? 'border-luxury-gold/60 bg-neutral-900/80 shadow-md shadow-luxury-gold/5'
                  : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {addr.label?.toLowerCase() === 'office' ? (
                      <Building2 className="h-4 w-4 text-luxury-gold" />
                    ) : (
                      <Home className="h-4 w-4 text-luxury-gold" />
                    )}
                    <span className="text-sm font-semibold text-white">
                      {addr.label || 'Delivery Address'}
                    </span>
                  </div>
                  {addr.isDefault && (
                    <Badge variant="gold" className="text-[10px] uppercase font-bold tracking-wider">
                      Default Delivery
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base text-neutral-200 mt-1">{addr.fullName}</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-xs text-neutral-300">
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-500 mt-0.5" />
                  <div className="leading-relaxed">
                    <p>{addr.addressLine}</p>
                    <p>
                      {addr.city ? `${addr.city}, ` : ''}
                      <span className="font-semibold text-white">{addr.district}</span>
                      {addr.postalCode ? ` ${addr.postalCode}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-neutral-400">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  <span>{addr.phone1}</span>
                  {addr.phone2 && <span className="text-neutral-600">/ {addr.phone2}</span>}
                </div>

                {addr.deliveryNotes && (
                  <p className="text-[11px] text-neutral-400 italic bg-neutral-950/50 p-2 rounded border border-neutral-800/80">
                    "{addr.deliveryNotes}"
                  </p>
                )}

                {/* Actions */}
                <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                  <div>
                    {!addr.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(addr.id)}
                        disabled={loading}
                        className="text-[11px] font-medium text-luxury-gold hover:underline disabled:opacity-50"
                      >
                        Set as Default
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(addr)}
                      className="h-7 px-2.5 text-[11px] border-neutral-700 hover:border-luxury-gold"
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(addr.id)}
                      className="h-7 px-2.5 text-[11px] border-neutral-800 text-rose-400 hover:text-rose-300 hover:border-rose-800"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-serif font-bold text-white">
                {editingAddress ? 'Edit Delivery Address' : 'Add New Delivery Address'}
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Ensure accurate recipient information for courier dispatch across Sri Lanka.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Preset Label Pills */}
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-300">Address Label</Label>
                <div className="flex items-center gap-2">
                  {['Home', 'Office', 'Other'].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLabel(l)}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        label === l
                          ? 'bg-luxury-gold/15 border-luxury-gold text-luxury-gold'
                          : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                  <Input
                    placeholder="Custom label..."
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="h-7 text-xs flex-1 border-neutral-800 bg-neutral-950"
                  />
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <Label className="text-xs text-neutral-300">Recipient Full Name *</Label>
                <Input
                  required
                  placeholder="e.g. Kasun Perera"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="border-neutral-800 bg-neutral-950 text-xs text-white"
                />
              </div>

              {/* Phones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-neutral-300">Primary Phone *</Label>
                  <Input
                    required
                    placeholder="0771234567 or +9477..."
                    value={phone1}
                    onChange={(e) => setPhone1(e.target.value)}
                    className="border-neutral-800 bg-neutral-950 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-neutral-300">Secondary Phone (Optional)</Label>
                  <Input
                    placeholder="Optional backup number"
                    value={phone2}
                    onChange={(e) => setPhone2(e.target.value)}
                    className="border-neutral-800 bg-neutral-950 text-xs text-white"
                  />
                </div>
              </div>

              {/* Address Line */}
              <div className="space-y-1">
                <Label className="text-xs text-neutral-300">Street Address *</Label>
                <Input
                  required
                  placeholder="e.g. No. 45/2, Galle Road, Bambalapitiya"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="border-neutral-800 bg-neutral-950 text-xs text-white"
                />
              </div>

              {/* City & District */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-neutral-300">City / Town</Label>
                  <Input
                    placeholder="e.g. Colombo 04"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="border-neutral-800 bg-neutral-950 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-neutral-300">Administrative District *</Label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full h-9 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-luxury-gold"
                  >
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <option key={d} value={d} className="bg-neutral-950 text-white">
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Postal Code & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-neutral-300">Postal Code (Optional)</Label>
                  <Input
                    placeholder="e.g. 00400"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="border-neutral-800 bg-neutral-950 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-neutral-300">Delivery Instructions</Label>
                  <Input
                    placeholder="e.g. Gate code, call on arrival"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    className="border-neutral-800 bg-neutral-950 text-xs text-white"
                  />
                </div>
              </div>

              {/* Default Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="addr-default-check"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-luxury-gold focus:ring-luxury-gold"
                />
                <label htmlFor="addr-default-check" className="text-xs text-neutral-300 cursor-pointer">
                  Set as default delivery address for future orders
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={loading}
                  className="border-neutral-700 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="sm"
                  disabled={loading}
                  className="text-xs font-semibold px-5"
                >
                  {loading ? 'Saving...' : editingAddress ? 'Update Address' : 'Save Address'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
