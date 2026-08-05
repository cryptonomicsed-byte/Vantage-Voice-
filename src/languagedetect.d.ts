declare module 'languagedetect' {
  export default class LanguageDetect {
    constructor();
    detect(text: string, limit?: number): Array<[string, number]>;
    setLanguageType(type: string): void;
  }
}
