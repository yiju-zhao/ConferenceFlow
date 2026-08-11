import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Popover,
  Menu,
  MenuItem,
  MenuDivider,
  Switch,
  InputGroup,
  Button,
} from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { COLORS } from "../constants";
import LanguageSwitcher from "./LanguageSwitcher";

interface UserAvatarProps {
  size?: number;
  onSignOut?: () => void;
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length].hex;
}

function getInitial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

export default function UserAvatar({ size = 32, onSignOut }: UserAvatarProps) {
  const { userProfile, updateDisplayName, signOut, isSuperAdmin } = useAuth();
  const { dark, toggleDark } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName = userProfile?.displayName || "";
  const initial = getInitial(displayName);
  const color = getAvatarColor(displayName);

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
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    onSignOut?.();
  };

  const goAdmin = () => {
    setOpen(false);
    navigate("/super-admin");
  };

  return (
    <Popover
      isOpen={open}
      interactionKind="click"
      onInteraction={(next) => setOpen(next)}
      onClose={() => {
        setOpen(false);
        setEditing(false);
      }}
      placement="bottom-end"
      content={
        <div style={{ minWidth: 248, fontFamily: "'Inter', sans-serif" }}>
          {/* Profile header */}
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: color,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "'Work Sans', sans-serif",
                }}
              >
                {initial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary, #1a1c1c)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {displayName}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted, #888)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {userProfile?.email}
                </div>
              </div>
            </div>

            {editing ? (
              <div>
                <InputGroup
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  placeholder={t("avatar.enterDisplayName")}
                  autoFocus
                  small
                  fill
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <Button
                    intent="primary"
                    small
                    text={saving ? t("common.saving") : t("common.save")}
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                  />
                  <Button small text={t("common.cancel")} onClick={() => setEditing(false)} />
                </div>
              </div>
            ) : (
              <Button
                minimal
                small
                icon={IconNames.EDIT}
                text={t("avatar.editName")}
                onClick={handleEdit}
              />
            )}
          </div>

          {/* Setting rows (controls must stay interactive inside the popover) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px",
            }}
          >
            <span style={{ fontSize: 14 }}>{t("avatar.language")}</span>
            <LanguageSwitcher variant="badge" />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px",
            }}
          >
            <span style={{ fontSize: 14 }}>{t("avatar.darkMode")}</span>
            <Switch checked={dark} onChange={toggleDark} />
          </div>

          {/* Actions */}
          <Menu style={{ boxShadow: "none" }}>
            {isSuperAdmin && (
              <MenuItem icon={IconNames.CROWN} text={t("avatar.adminPanel")} onClick={goAdmin} />
            )}
            <MenuDivider />
            <MenuItem
              icon={IconNames.LOG_OUT}
              text={t("avatar.signOut")}
              intent="danger"
              onClick={handleSignOut}
            />
          </Menu>
        </div>
      }
    >
      <button
        type="button"
        title={displayName}
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
        }}
      >
        {initial}
      </button>
    </Popover>
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
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div style={{ background: "#fff", width: "100%", maxWidth: 400 }}>
        <div
          style={{
            background: "#a20513",
            padding: "20px 24px",
            color: "#fff",
            fontFamily: "'Work Sans', sans-serif",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t("avatar.welcome")}</h2>
          <p style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{t("avatar.setupName")}</p>
        </div>
        <div style={{ padding: 24 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "#5f5e5e",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 6,
              fontFamily: "'Work Sans', sans-serif",
              fontWeight: 600,
            }}
          >
            {t("auth.displayName")}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
            placeholder={t("avatar.enterYourName")}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "none",
              borderBottom: "2px solid transparent",
              background: "#e8e8e8",
              outline: "none",
              fontFamily: "'Inter', sans-serif",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderBottomColor = "#a20513")}
            onBlur={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
          />
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              width: "100%",
              marginTop: 16,
              padding: "12px",
              fontSize: 13,
              fontWeight: 700,
              background: "#a20513",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              fontFamily: "'Work Sans', sans-serif",
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? t("common.saving") : t("avatar.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
