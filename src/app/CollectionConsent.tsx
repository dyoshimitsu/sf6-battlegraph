import { useEffect, useRef } from "react";
import { type Locale, translations } from "../i18n/translations";

export function CollectionConsent({
  locale,
  visibility,
  onCancel,
  onAgree,
}: {
  locale: Locale;
  visibility: "public" | "private";
  onCancel: () => void;
  onAgree: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const text = translations[locale];
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="collection-consent"
      aria-labelledby="collection-consent-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="collection-consent-title">{text.consentTitle}</h2>
      <p>{text.consentData}</p>
      <p>{text.consentStorage}</p>
      <p>{visibility === "public" ? text.consentPublic : text.consentPrivate}</p>
      <p>{text.consentSession}</p>
      <a href="./privacy.html" target="_blank" rel="noopener noreferrer">
        {text.consentPrivacy}
      </a>
      <div className="collection-consent-actions">
        <button type="button" className="auth-button" onClick={onCancel}>
          {text.consentCancel}
        </button>
        <button type="button" className="primary-button" onClick={onAgree}>
          {text.consentAgree}
        </button>
      </div>
    </dialog>
  );
}
