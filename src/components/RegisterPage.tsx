import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { Card, FormGroup, InputGroup, Button, Divider, Icon, Callout } from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { useAuth } from "../contexts/AuthContext";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) return setError(t("auth.passwordMismatch"));
    if (password.length < 6) return setError(t("auth.passwordTooShort"));
    if (!displayName.trim()) return setError(t("auth.nameRequired"));
    setLoading(true);
    try {
      await signUpWithEmail(email, password, displayName.trim());
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(err.code === "auth/email-already-in-use" ? t("auth.emailInUse") : err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon icon={IconNames.CALENDAR} size={22} intent="primary" />
          <div>
            <div
              style={{
                fontFamily: "'Work Sans', sans-serif",
                fontSize: 22,
                lineHeight: 1,
                display: "flex",
                alignItems: "baseline",
                gap: 1,
              }}
            >
              <span style={{ fontWeight: 800, letterSpacing: "-0.035em" }}>Conference</span>
              <span style={{ fontWeight: 400, letterSpacing: "0.01em", color: "var(--accent-dash)" }}>Flow</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>{t("auth.tagline")}</div>
          </div>
        </div>

        <Card elevation={1}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {error && <Callout intent="danger" style={{ marginBottom: 0 }}>{error}</Callout>}

            <form
              onSubmit={handleRegister}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <FormGroup label={t("auth.displayName")} style={{ marginBottom: 0 }}>
                <InputGroup
                  leftIcon={IconNames.USER}
                  placeholder={t("auth.displayNamePlaceholder")}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </FormGroup>
              <FormGroup label={t("auth.email")} style={{ marginBottom: 0 }}>
                <InputGroup
                  leftIcon={IconNames.ENVELOPE}
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                />
              </FormGroup>
              <FormGroup label={t("auth.password")} style={{ marginBottom: 0 }} helperText={t("auth.passwordHint")}>
                <InputGroup
                  leftIcon={IconNames.LOCK}
                  type="password"
                  placeholder={t("auth.passwordHint")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </FormGroup>
              <FormGroup label={t("auth.confirmPassword")} style={{ marginBottom: 0 }}>
                <InputGroup
                  leftIcon={IconNames.LOCK}
                  type="password"
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </FormGroup>
              <Button
                type="submit"
                intent="primary"
                fill
                loading={loading}
                rightIcon={IconNames.ARROW_RIGHT}
              >
                {t("auth.createAccount")}
              </Button>
            </form>

            <Divider />

            <Button
              type="button"
              icon={IconNames.GLOBE}
              fill
              onClick={handleGoogleSignUp}
              disabled={loading}
            >
              {t("auth.signUpWithGoogle")}
            </Button>

            <div style={{ textAlign: "center", fontSize: 13, opacity: 0.65 }}>
              {t("auth.hasAccount")}{" "}
              <Link to="/login" style={{ color: "inherit", textDecoration: "none" }}>
                <span style={{ color: "var(--link)" }}>{t("auth.signIn")}</span>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
