import { DbCatalogItem } from "./types";

const unsupportedNote = "该类型当前仅支持配置管理，暂不支持连接测试";

export const DB_CATALOG: DbCatalogItem[] = [
  {
    dbType: "PostgreSQL",
    template:
      "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=123456;Pooling=true;Minimum Pool Size=1;Maximum Pool Size=100;",
    supportsConnectionTest: true,
    testSupportNote: "",
  },
  {
    dbType: "MySql",
    template:
      "Server=localhost;Port=3306;Database=mydb;User=root;Password=123456;Charset=utf8mb4;Pooling=true;Min Pool Size=1;Max Pool Size=100;",
    supportsConnectionTest: true,
    testSupportNote: "",
  },
  {
    dbType: "SqlServer",
    template:
      "Server=localhost;Database=master;User Id=sa;Password=123456;Encrypt=True;TrustServerCertificate=True;Min Pool Size=1;Max Pool Size=100;",
    supportsConnectionTest: true,
    testSupportNote: "",
  },
  {
    dbType: "Oracle",
    template:
      "Data Source=localhost/orcl;User ID=system;Password=oracle123;Pooling=true;Min Pool Size=5;Max Pool Size=150;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "Sqlite",
    template: "Data Source=./data/local.db;Cache=Shared;Mode=ReadWriteCreate;",
    supportsConnectionTest: true,
    testSupportNote: "",
  },
  {
    dbType: "MongoDb",
    template: "mongodb://root:123456@localhost:27017/mydb?authSource=admin",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "ClickHouse",
    template: "Host=localhost;Port=8123;User=default;Password=;Database=default",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "Tidb",
    template:
      "Server=localhost;Port=4000;Database=bigdata;User=root;Password=123456;Charset=utf8mb4;Pooling=true;Min Pool Size=1;Max Pool Size=50;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "OceanBase",
    template:
      "Server=localhost;Port=2881;Database=test;User=root@sys;Password=password;Charset=utf8mb4;Pooling=true;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "OceanBaseForOracle",
    template:
      "Driver={OceanBase ODBC 2.0 Driver};Server=localhost;Port=2883;Database=ORCL;User=USER@TENANT#CLUSTER;Password=strong_pwd;Option=3;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "Dm",
    template: "Server=localhost;Port=5236;Database=finance;User=SYSDBA;Password=SYSDBA001;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "Kdbndp",
    template: "Server=localhost;Port=54321;Database=crm;User=SYSTEM;Password=system123;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "GaussDBNative",
    template:
      "PORT=5432;DATABASE=analytics;HOST=localhost;PASSWORD=Gauss@123;USER ID=gaussdb;No Reset On Close=true;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "OpenGauss",
    template:
      "PORT=5432;DATABASE=tenant;HOST=localhost;PASSWORD=Gauss@123;USER ID=gaussdb;No Reset On Close=true;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "PolarDB",
    template: "Server=localhost;Port=3306;Database=mydb;Uid=root;Pwd=123456;Pooling=false;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "Vastbase",
    template:
      "PORT=5432;DATABASE=report;HOST=localhost;USER ID=postgres;PASSWORD=pass;No Reset On Close=true;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "HG",
    template: "Server=localhost;Port=5866;UId=design;Password=000;Database=design;searchpath=design;Pooling=false;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "GoldenDB",
    template: "Server=localhost;Port=3306;Database=mydb;Uid=root;Pwd=123456;Pooling=false;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "GBase",
    template:
      "Host=localhost;Service=19088;Server=gbase01;Database=testdb;Protocol=onsoctcp;Uid=gbasedbt;Pwd=GBase123;Db_locale=zh_CN.utf8;Client_locale=zh_CN.utf8",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "Doris",
    template: "Server=localhost;Database=mydb;Uid=root;Pwd=123456;Pooling=false;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "TDengine",
    template: "Host=localhost;Port=6030;Username=root;Password=taosdata;Database=power",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "DuckDB",
    template: "DataSource=./duck.db",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "QuestDB",
    template:
      "host=localhost;port=8812;username=admin;password=quest;database=qdb;ServerCompatibilityMode=NoTypeLoading;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
  {
    dbType: "Oscar",
    template: "Data Source=localhost;User Id=sysdba;Password=oscar;",
    supportsConnectionTest: false,
    testSupportNote: unsupportedNote,
  },
];

export const DEFAULT_DB_TYPE = "PostgreSQL";

const catalogByType = new Map(DB_CATALOG.map((item) => [item.dbType, item]));

export const getDbCatalogItem = (dbType: string): DbCatalogItem | undefined =>
  catalogByType.get(dbType);

export const getConnectionTemplate = (dbType: string): string =>
  getDbCatalogItem(dbType)?.template ?? "";

export const canTestConnection = (dbType: string): boolean =>
  getDbCatalogItem(dbType)?.supportsConnectionTest ?? false;

export const getTestSupportNote = (dbType: string): string =>
  getDbCatalogItem(dbType)?.testSupportNote || unsupportedNote;
