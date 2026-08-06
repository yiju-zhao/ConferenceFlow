import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { Card, FormGroup, InputGroup, Button, Divider, Icon, Callout } from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleEmailLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(
          err.code === "auth/invalid-credential" ? t("auth.invalidCredential") : err.message,
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
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
        background: "#F6F7F9",
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
              <span style={{ fontWeight: 400, letterSpacing: "0.01em", color: "#4A7FB5" }}>Flow</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>{t("auth.tagline")}</div>
          </div>
        </div>

        <Card elevation={1}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {error && <Callout intent="danger" style={{ marginBottom: 0 }}>{error}</Callout>}

            <form
              onSubmit={handleEmailLogin}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
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
              <FormGroup label={t("auth.password")} style={{ marginBottom: 0 }}>
                <InputGroup
                  leftIcon={IconNames.LOCK}
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                {t("auth.signIn")}
              </Button>
            </form>

            <Divider />

            <Button
              type="button"
              icon={IconNames.GLOBE}
              fill
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              {t("auth.signInWithGoogle")}
            </Button>

            <div style={{ textAlign: "center", fontSize: 13, opacity: 0.65 }}>
              {t("auth.noAccount")}{" "}
              <Link to="/register" style={{ color: "inherit", textDecoration: "none" }}>
                <span style={{ color: "#2D72D2" }}>{t("auth.signUp")}</span>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
