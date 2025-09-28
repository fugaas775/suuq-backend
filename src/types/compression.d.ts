declare module 'compression' {
  import { RequestHandler } from 'express';
  function compression(...args: any[]): RequestHandler;
  export default compression;
}
