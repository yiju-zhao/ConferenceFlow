import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher({ className = "", style, variant = "default" }) {
  const { i18n } = useTranslation();

  const toggle = () => {
    const next = i18n.language.startsWith('zh') ? 'en-US' : 'zh-CN';
    i18n.changeLanguage(next);
  };

  const isZh = i18n.language.startsWith('zh');

  if (variant === "badge") {
    return (
      <button
        onClick={toggle}
        style={{
          padding: "4px 12px",
          fontSize: 13,
          fontWeight: 500,
          color: "#333",
          background: "#f3f3f3",
          border: "1px solid #e5e5e5",
          borderRadius: 6,
          cursor: "pointer",
          fontFamily: "'Inter', sans-serif",
          ...style,
        }}
        title={isZh ? 'Switch to English' : '切换到中文'}
      >
        {isZh ? '中文 ▾' : 'EN ▾'}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={`text-xs font-headline tracking-wider transition-colors ${className}`}
      style={style}
      title={isZh ? 'Switch to English' : '切换到中文'}
    >
      {isZh ? '中文 / EN' : 'EN / 中文'}
    </button>
  );
}
