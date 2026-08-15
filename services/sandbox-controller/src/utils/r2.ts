import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible. Credentials live ONLY here in the controller —
// never inside a sandbox (the agent runs arbitrary code there). Sandboxes upload
// and download via short-lived presigned URLs generated below.
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;

// When R2 isn't set up, snapshot/restore become no-ops so the app keeps working.
export const isR2Configured = (): boolean =>
  Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);

let client: S3Client | null = null;
const getClient = (): S3Client => {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID as string,
        secretAccessKey: SECRET_ACCESS_KEY as string,
      },
    });
  }
  return client;
};

// One workspace snapshot per chat.
export const workspaceKey = (chatId: string): string =>
  `workspaces/${chatId}.tar.gz`;

const EXPIRES_IN = 600; // 10 min — ample for a single upload/download.

export const presignPut = (key: string): Promise<string> =>
  getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: BUCKET as string, Key: key }),
    { expiresIn: EXPIRES_IN },
  );

export const presignGet = (key: string): Promise<string> =>
  getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: BUCKET as string, Key: key }),
    { expiresIn: EXPIRES_IN },
  );

export const objectExists = async (key: string): Promise<boolean> => {
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: BUCKET as string, Key: key }),
    );
    return true;
  } catch {
    return false;
  }
};
