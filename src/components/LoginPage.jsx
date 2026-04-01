import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.code === "auth/invalid-credential"
        ? "Invalid email or password"
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-primary p-6 mb-0">
          <h1 className="font-headline text-on-primary text-2xl font-bold tracking-tight">
            CONFERENCEFLOW
          </h1>
          <p className="text-on-primary/70 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="bg-surface-container-lowest p-6">
          {error && (
            <div className="bg-primary/10 text-primary text-sm p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin}>
            <div className="mb-4">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary p-3 font-headline text-sm font-bold
                uppercase tracking-wider hover:bg-primary-container transition-colors duration-50
                disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-surface-dim"></div>
            <span className="text-secondary text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-surface-dim"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-surface-container p-3 text-on-surface text-sm font-body
              hover:bg-surface-container-high transition-colors duration-50
              disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>

          <p className="text-center text-secondary text-sm mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
