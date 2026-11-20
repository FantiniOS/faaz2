declare module "oracledb" {
  interface OracleDbModule {
    readonly CLOB: number;
    readonly BLOB: number;
    readonly NUMBER: number;
    readonly DATE: number;
    fetchAsString: number[];
    fetchArraySize: number;
  }

  const oracledb: OracleDbModule;
  export default oracledb;
}
