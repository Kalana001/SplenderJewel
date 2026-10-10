import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-md border-neutral-800 bg-neutral-900/60 p-6">
        <CardHeader className="text-center p-0 mb-6">
          <div className="mx-auto h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center text-luxury-gold mb-3">
            <Shield className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl text-white">Admin Authentication</CardTitle>
          <CardDescription className="text-xs text-neutral-400 mt-1">
            Restricted to authorized Splender Jewel store administrators.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Admin Email
              </label>
              <Input
                type="email"
                placeholder="admin@splenderjewel.com"
                disabled
                className="bg-neutral-800/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                disabled
                className="bg-neutral-800/50"
              />
            </div>
          </div>

          <div className="p-3 rounded-sm bg-luxury-gold/10 border border-luxury-gold/20 text-xs text-luxury-gold-light">
            <span>Admin authentication verification and role validation will be enabled upon connecting Supabase in Phase 1.</span>
          </div>

          <Button variant="gold" className="w-full" disabled>
            <Lock className="h-4 w-4 mr-2" />
            <span>Sign In (Phase 1)</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
