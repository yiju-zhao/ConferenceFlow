import { useState, useRef, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useAuth } from "../contexts/AuthContext";
import { COLORS } from "../constants";
import LanguageSwitcher from './LanguageSwitcher';

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length].hex;
}

function getInitial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

/**
 * Circular avatar showing first letter of display name.
 * Clicking opens a dropdown to edit display name or sign out.
 * Props:
 *   size: number (default 32)
 *   onSignOut: function (optional, called after sign out)
 *   light: boolean (for dark backgrounds, default false)
 */
export default function UserAvatar({ size = 32, onSignOut, light = false }) {
  const { userProfile, updateDisplayName, signOut } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  const displayName = userProfile?.displayName || "";
  const initial = getInitial(displayName);
  const color = getAvatarColor(displayName);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const handleEdit = () => {
    setName(displayName);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateDisplayName(name.trim());
      setEditing(false);
      setOpen(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    onSignOut?.();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Avatar circle */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.45,
          fontFamily: "'Work Sans', sans-serif",
          fontWeight: 700,
          letterSpacing: 0,
          transition: "opacity 100ms",
        }}
        title={displayName}
      >
        {initial}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: size + 6,
            right: 0,
            background: "#fff",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            borderRadius: 8,
            minWidth: 240,
            zIndex: 100,
            fontFamily: "'Inter', sans-serif",
            overflow: "hidden",
          }}
        >
          {/* Profile info */}
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #eee" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: "50%", background: color,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, fontFamily: "'Work Sans', sans-serif",
                }}
              >
                {initial}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1c1c" }}>{displayName}</div>
                <div style={{ fontSize: 11, color: "#5f5e5e" }}>{userProfile?.email}</div>
              </div>
            </div>

            {editing ? (
              <div style={{ marginTop: 8 }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  autoFocus
                  style={{
                    width: "100%", padding: "6px 8px", fontSize: 13,
                    border: "none", borderBottom: "2px solid #a20513",
                    background: "#f3f3f3", outline: "none", fontFamily: "'Inter', sans-serif",
                  }}
                  placeholder={t('avatar.enterDisplayName')}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    style={{
                      flex: 1, padding: "6px", fontSize: 11, fontWeight: 600,
                      background: "#a20513", color: "#fff", border: "none", cursor: "pointer",
                      textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Work Sans', sans-serif",
                      opacity: saving || !name.trim() ? 0.5 : 1,
                    }}
                  >
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{
                      flex: 1, padding: "6px", fontSize: 11, fontWeight: 600,
                      background: "#eee", color: "#5f5e5e", border: "none", cursor: "pointer",
                      textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Work Sans', sans-serif",
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleEdit}
                style={{
                  fontSize: 11, color: "#a20513", background: "none", border: "none",
                  cursor: "pointer", padding: 0, textTransform: "uppercase", letterSpacing: 1,
                  fontFamily: "'Work Sans', sans-serif", fontWeight: 600,
                }}
              >
                {t('avatar.editName')}
              </button>
            )}
          </div>

          {/* Language */}
          <div style={{
            padding: "12px 16px",
            borderTop: "1px solid #eee",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 14, color: "#333", fontFamily: "'Inter', sans-serif" }}>
              Language / 语言
            </span>
            <LanguageSwitcher variant="dropdown" />
          </div>

          {/* Sign Out */}
          <div style={{ borderTop: "1px solid #eee", padding: "8px 16px" }}>
            <button
              onClick={handleSignOut}
              style={{
                width: "100%", padding: "8px 0", fontSize: 14, color: "#e53e3e",
                background: "none", border: "none", cursor: "pointer", textAlign: "left",
                fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={(e) => (e.target.style.color = "#c53030")}
              onMouseLeave={(e) => (e.target.style.color = "#e53e3e")}
            >
              {t('avatar.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * First-time name setup modal.
 * Shows when user has no displayName set.
 */
export function FirstTimeNameSetup() {
  const { userProfile, updateDisplayName } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState(userProfile?.displayName || "");
  const [saving, setSaving] = useState(false);

  // Only show if profile exists but displayName is empty
  if (!userProfile || userProfile.displayName) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateDisplayName(name.trim());
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 400 }}>
        <div style={{
          background: "#a20513", padding: "20px 24px", color: "#fff",
          fontFamily: "'Work Sans', sans-serif",
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('avatar.welcome')}</h2>
          <p style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{t('avatar.setupName')}</p>
        </div>
        <div style={{ padding: 24 }}>
          <label style={{
            display: "block", fontSize: 11, color: "#5f5e5e", textTransform: "uppercase",
            letterSpacing: 1, marginBottom: 6, fontFamily: "'Work Sans', sans-serif", fontWeight: 600,
          }}>
            {t('auth.displayName')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
            placeholder={t('avatar.enterYourName')}
            style={{
              width: "100%", padding: "10px 12px", fontSize: 14, border: "none",
              borderBottom: "2px solid transparent", background: "#e8e8e8",
              outline: "none", fontFamily: "'Inter', sans-serif", boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderBottomColor = "#a20513")}
            onBlur={(e) => (e.target.style.borderBottomColor = "transparent")}
          />
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              width: "100%", marginTop: 16, padding: "12px", fontSize: 13, fontWeight: 700,
              background: "#a20513", color: "#fff", border: "none", cursor: "pointer",
              textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "'Work Sans', sans-serif",
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? t('common.saving') : t('avatar.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
