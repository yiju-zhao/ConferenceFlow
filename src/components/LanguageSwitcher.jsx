import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher({ className = "", style }) {
  const { i18n } = useTranslation();

  const toggle = () => {
    const next = i18n.language.startsWith('zh') ? 'en-US' : 'zh-CN';
    i18n.changeLanguage(next);
  };

  const isZh = i18n.language.startsWith('zh');

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
