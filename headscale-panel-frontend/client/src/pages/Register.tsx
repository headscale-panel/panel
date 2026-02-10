import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Activity, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { toast } from 'sonner';
import { authAPI } from '@/lib/api';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function Register() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
  });

  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });

  const strengthCount = Object.values(passwordStrength).filter(Boolean).length;
  const strengthPercent = (strengthCount / 5) * 100;
  const strengthColor =
    strengthCount <= 1
      ? 'bg-red-500'
      : strengthCount <= 2
        ? 'bg-orange-500'
        : strengthCount <= 3
          ? 'bg-yellow-500'
          : strengthCount <= 4
            ? 'bg-blue-500'
            : 'bg-emerald-500';
  const strengthLabel =
    strengthCount <= 1
      ? 'Weak'
      : strengthCount <= 2
        ? 'Fair'
        : strengthCount <= 3
          ? 'Good'
          : strengthCount <= 4
            ? 'Strong'
            : 'Excellent';

  const handlePasswordChange = (password: string) => {
    setFormData({ ...formData, password });
    setPasswordStrength({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!Object.values(passwordStrength).every(Boolean)) {
      toast.error('Password does not meet all requirements');
      return;
    }

    setLoading(true);
    try {
      await authAPI.register(formData.username, formData.password, formData.email);
      toast.success('Registration successful! Redirecting to login...');
      setTimeout(() => setLocation('/login'), 1500);
    } catch (error: any) {
      toast.error('Registration failed: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f8] dark:bg-gray-950 px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-[420px]"
      >
        <Card className="rounded-2xl shadow-lg border-0 bg-white dark:bg-gray-900 p-8">
          {/* Logo and Title */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-[#0559C9] rounded-xl flex items-center justify-center mb-4 shadow-md">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Headscale Panel
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create your account
            </p>
          </div>

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                placeholder="Enter username"
                required
                disabled={loading}
                className="h-10 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-[#0559C9] focus:ring-[#0559C9]/20"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="you@example.com"
                required
                disabled={loading}
                className="h-10 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-[#0559C9] focus:ring-[#0559C9]/20"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="Create a password"
                  required
                  disabled={loading}
                  className="h-10 pr-10 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-[#0559C9] focus:ring-[#0559C9]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="pt-1.5 space-y-2">
                  {/* Strength Bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500 ease-out',
                          strengthColor
                        )}
                        style={{ width: `${strengthPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 min-w-[52px] text-right">
                      {strengthLabel}
                    </span>
                  </div>

                  {/* Requirements Checklist */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {[
                      { key: 'length', label: '8+ characters' },
                      { key: 'uppercase', label: 'Uppercase' },
                      { key: 'lowercase', label: 'Lowercase' },
                      { key: 'number', label: 'Number' },
                      { key: 'special', label: 'Special char' },
                    ].map((item) => {
                      const met =
                        passwordStrength[
                          item.key as keyof typeof passwordStrength
                        ];
                      return (
                        <div
                          key={item.key}
                          className="flex items-center gap-1.5"
                        >
                          <CheckCircle2
                            className={cn(
                              'w-3 h-3 flex-shrink-0 transition-colors duration-200',
                              met
                                ? 'text-emerald-500'
                                : 'text-gray-300 dark:text-gray-600'
                            )}
                          />
                          <span
                            className={cn(
                              'text-[11px] transition-colors duration-200',
                              met
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-gray-400 dark:text-gray-500'
                            )}
                          >
                            {item.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  placeholder="Confirm your password"
                  required
                  disabled={loading}
                  className="h-10 pr-10 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-[#0559C9] focus:ring-[#0559C9]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {formData.confirmPassword &&
                formData.password !== formData.confirmPassword && (
                  <p className="text-[11px] text-red-500 mt-1">
                    Passwords do not match
                  </p>
                )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-10 rounded-lg bg-[#0559C9] hover:bg-[#044ca3] text-white font-medium shadow-none transition-colors mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              Already have an account?
            </span>
            <Link href="/login">
              <span className="text-[#0559C9] hover:text-[#044ca3] hover:underline ml-1 cursor-pointer font-medium">
                Sign in
              </span>
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
