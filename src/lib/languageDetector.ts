import LanguageDetect from 'languagedetect';

const detector = new LanguageDetect();

// Map common languagedetect output names (lowercase) to ISO 639-1 language codes and display names
const LANGUAGE_CODE_MAP: Record<string, { code: string; name: string }> = {
  english: { code: 'en', name: 'English' },
  spanish: { code: 'es', name: 'Spanish' },
  french: { code: 'fr', name: 'French' },
  german: { code: 'de', name: 'German' },
  italian: { code: 'it', name: 'Italian' },
  portuguese: { code: 'pt', name: 'Portuguese' },
  russian: { code: 'ru', name: 'Russian' },
  japanese: { code: 'ja', name: 'Japanese' },
  chinese: { code: 'zh', name: 'Chinese' },
  korean: { code: 'ko', name: 'Korean' },
  arabic: { code: 'ar', name: 'Arabic' },
  dutch: { code: 'nl', name: 'Dutch' },
  polish: { code: 'pl', name: 'Polish' },
  turkish: { code: 'tr', name: 'Turkish' },
  hindi: { code: 'hi', name: 'Hindi' },
  swedish: { code: 'sv', name: 'Swedish' },
  danish: { code: 'da', name: 'Danish' },
  finnish: { code: 'fi', name: 'Finnish' },
  norwegian: { code: 'no', name: 'Norwegian' },
  greek: { code: 'el', name: 'Greek' },
  vietnamese: { code: 'vi', name: 'Vietnamese' },
  thai: { code: 'th', name: 'Thai' },
  indonesian: { code: 'id', name: 'Indonesian' },
  ukrainian: { code: 'uk', name: 'Ukrainian' },
  romanian: { code: 'ro', name: 'Romanian' },
  hungarian: { code: 'hu', name: 'Hungarian' },
  czech: { code: 'cs', name: 'Czech' },
};

export interface DetectedLanguageResult {
  detectedLanguageName: string;
  detectedCode: string;
  displayName: string;
  score: number;
}

export function detectSpokenLanguage(text: string): DetectedLanguageResult | null {
  if (!text || text.trim().length < 3) return null;

  try {
    const results = detector.detect(text, 3);
    if (!results || results.length === 0) return null;

    for (const [langName, score] of results) {
      const normalizedName = langName.toLowerCase();
      if (LANGUAGE_CODE_MAP[normalizedName] && score > 0.1) {
        const langInfo = LANGUAGE_CODE_MAP[normalizedName];
        return {
          detectedLanguageName: langName,
          detectedCode: langInfo.code,
          displayName: langInfo.name,
          score,
        };
      }
    }
  } catch (err) {
    console.error('Language detection failed:', err);
  }

  return null;
}
