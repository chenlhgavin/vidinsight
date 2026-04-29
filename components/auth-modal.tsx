'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createClient } from '@/lib/supabase/client';
import { resolveAppUrl } from '@/lib/utils';
import { toast } from 'sonner';
import { rememberPendingVideo } from '@/contexts/auth-context';

export type AuthModalTrigger = 'manual' | 'generation-limit' | 'save-video' | 'save-note';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectPath?: string;
  currentVideoId?: string | null;
  trigger?: AuthModalTrigger;
}

type SubmittingState = null | 'signin' | 'signup' | 'google' | 'magic';

interface ModalCopy {
  eyebrowSignin: string;
  eyebrowSignup: string;
  titlePrefix: string;
  titleAccent: string;
  titleSuffix: string;
  description: string;
  benefits: string[];
  showBenefits: boolean;
}

function getCopy(trigger: AuthModalTrigger): ModalCopy {
  switch (trigger) {
    case 'generation-limit':
      return {
        eyebrowSignin: 'Free preview used',
        eyebrowSignup: 'Free preview used',
        titlePrefix: 'Continue ',
        titleAccent: 'analyzing',
        titleSuffix: '.',
        description:
          "You've used your free preview. Create a free account to keep watching less and learning more.",
        benefits: [
          'Unlimited monthly previews',
          'Save notes and highlights across devices',
          'Resume any analyzed video instantly',
        ],
        showBenefits: true,
      };
    case 'save-video':
      return {
        eyebrowSignin: 'Save your videos',
        eyebrowSignup: 'Save your videos',
        titlePrefix: 'Build your ',
        titleAccent: 'library',
        titleSuffix: '.',
        description: 'Sign in to save this video to your library and access it anywhere.',
        benefits: ['One-click favorites', 'Searchable history', 'Cross-device sync'],
        showBenefits: true,
      };
    case 'save-note':
      return {
        eyebrowSignin: 'Capture insights',
        eyebrowSignup: 'Capture insights',
        titlePrefix: 'Keep your ',
        titleAccent: 'notes',
        titleSuffix: '.',
        description: 'Sign in to save your highlights and notes for this video.',
        benefits: [
          'Save transcript snippets',
          'Organize across all videos',
          'Access from any device',
        ],
        showBenefits: true,
      };
    default:
      return {
        eyebrowSignin: 'Sign in',
        eyebrowSignup: 'Sign up',
        titlePrefix: 'Save your ',
        titleAccent: 'workbench',
        titleSuffix: '.',
        description: 'Sync notes across devices, save favorite videos, and unlock translations.',
        benefits: [],
        showBenefits: false,
      };
  }
}

export function AuthModal({ open, onOpenChange, redirectPath = '/', currentVideoId, trigger = 'manual' }: Props) {
  const [tab, setTab] = useState<'signin' | 'signup'>(trigger === 'generation-limit' ? 'signup' : 'signin');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(trigger === 'generation-limit' ? 'signup' : 'signin');
  }, [trigger]);
  const copy = getCopy(trigger);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState<SubmittingState>(null);
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleTabChange = (value: string) => {
    setTab(value as 'signin' | 'signup');
    setError(null);
  };

  const buildRedirect = () => {
    const base = resolveAppUrl(window.location.origin);
    return `${base}/auth/callback?next=${encodeURIComponent(redirectPath)}`;
  };

  const stashPendingVideo = () => {
    if (currentVideoId) rememberPendingVideo(currentVideoId);
  };

  const handleSignUp = async () => {
    if (!email.trim() || password.length < 6) return;
    setSubmitting('signup');
    setError(null);
    try {
      stashPendingVideo();
      const supabase = createClient();
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: buildRedirect() },
      });
      if (err) throw err;
      setSignupSuccess(true);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(null);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setSubmitting('signin');
    setError(null);
    try {
      stashPendingVideo();
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      toast.success('Welcome back.');
      onOpenChange(false);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(null);
    }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) {
      toast.error('Enter your email first.');
      return;
    }
    setSubmitting('magic');
    setError(null);
    try {
      stashPendingVideo();
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: buildRedirect() },
      });
      if (err) throw err;
      toast.success('Check your email for the magic link.');
      onOpenChange(false);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(null);
    }
  };

  const signInWithGoogle = async () => {
    setSubmitting('google');
    setError(null);
    try {
      stashPendingVideo();
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: buildRedirect() },
      });
      if (err) throw err;
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error(message);
      setSubmitting(null);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSignupSuccess(false);
      setError(null);
      setPassword('');
      setSubmitting(null);
    }
    onOpenChange(next);
  };

  const isBusy = submitting !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <div className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-40 w-40 -translate-x-1/2 rounded-full bg-lime/15 blur-3xl" />

        {signupSuccess ? (
          <>
            <DialogHeader>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface-3 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-lime" />
                Almost there
              </span>
              <DialogTitle>
                Check your <em className="font-display italic text-lime">email</em>.
              </DialogTitle>
              <DialogDescription>
                We sent a confirmation link to <strong className="text-foreground">{email}</strong>. Click it to activate your account and finish signing in.
              </DialogDescription>
            </DialogHeader>
            <Button variant="accent" className="mt-2 h-11 w-full" onClick={() => handleOpenChange(false)}>
              Got it
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface-3 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-lime" />
                {tab === 'signin' ? copy.eyebrowSignin : copy.eyebrowSignup}
              </span>
              <DialogTitle>
                {copy.titlePrefix}
                <em className="font-display italic text-lime">{copy.titleAccent}</em>
                {copy.titleSuffix}
              </DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>

            {copy.showBenefits && (
              <ul className="mt-2 space-y-2 rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted-foreground">
                {copy.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-lime" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-2 space-y-3">
              <Button
                variant="outline"
                className="h-11 w-full justify-center"
                onClick={signInWithGoogle}
                disabled={isBusy}
              >
                {submitting === 'google' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </Button>

              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  or with email
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSignIn();
                    }}
                    className="space-y-3"
                  >
                    <EmailField value={email} onChange={setEmail} disabled={isBusy} id="signin-email" />
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      disabled={isBusy}
                      id="signin-password"
                    />

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      variant="accent"
                      className="h-11 w-full"
                      disabled={isBusy || !email.trim() || !password}
                    >
                      {submitting === 'signin' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                        </>
                      ) : (
                        'Sign in'
                      )}
                    </Button>
                  </form>

                  <button
                    type="button"
                    className="block w-full text-center text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                    onClick={sendMagicLink}
                    disabled={isBusy}
                  >
                    {submitting === 'magic' ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Sending magic link…
                      </span>
                    ) : (
                      'Forgot password? Email me a magic link instead'
                    )}
                  </button>
                </TabsContent>

                <TabsContent value="signup" className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleSignUp();
                    }}
                    className="space-y-3"
                  >
                    <EmailField value={email} onChange={setEmail} disabled={isBusy} id="signup-email" />
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      disabled={isBusy}
                      id="signup-password"
                      placeholder="At least 6 characters"
                    />

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      variant="accent"
                      className="h-11 w-full"
                      disabled={isBusy || !email.trim() || password.length < 6}
                    >
                      {submitting === 'signup' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Creating account…
                        </>
                      ) : (
                        'Create account'
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </div>

            <p className="mt-1 text-[11px] text-muted-foreground">
              By continuing you agree to our Terms and Privacy Policy.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EmailFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  id: string;
}

function EmailField({ value, onChange, disabled, id }: EmailFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">Email</Label>
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
          className="h-11 pl-9"
        />
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  id: string;
  placeholder?: string;
}

function PasswordField({ value, onChange, disabled, id, placeholder }: PasswordFieldProps) {
  const isSignup = id.startsWith('signup');
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">Password</Label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
          minLength={isSignup ? 6 : undefined}
          className="h-11 pl-9"
        />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 39.7 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2c-.4.4 6.6-4.8 6.6-14.9 0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
