/**
 * 프록시 주소. **비밀이 아니므로 번들에 박아도 된다** — 키는 프록시 안에만 있다.
 *
 * .env를 쓰지 않는 이유는 `.env*`가 gitignore라 CI 빌드에서 값을 못 읽기 때문이다.
 * import.meta.env.DEV는 Vite 내장이라 파일이 필요 없다.
 */
export const PROXY_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:8787'
  : 'https://perjury-proxy.perjury.workers.dev'
