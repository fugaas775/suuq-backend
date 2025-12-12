declare module 'pg-mem' {
  export interface IType {}
  export enum DataType {
    text = 'text',
  }
  export function newDb(config?: any): any;
}
