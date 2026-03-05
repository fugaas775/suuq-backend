import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  ObjectIdentifier,
  S3Client,
} from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

type CliOptions = {
  bucket?: string;
  prefix?: string;
  execute: boolean;
};

function getCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    bucket: undefined,
    prefix: undefined,
    execute: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--bucket') {
      options.bucket = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--prefix') {
      options.prefix = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--execute') {
      options.execute = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.execute = false;
    }
  }

  return options;
}

async function deleteBatch(
  s3: S3Client,
  bucket: string,
  objects: ObjectIdentifier[],
): Promise<number> {
  if (!objects.length) {
    return 0;
  }

  const response = await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects,
        Quiet: false,
      },
    }),
  );

  const deleted = response.Deleted?.length ?? 0;
  const errors = response.Errors ?? [];

  if (errors.length > 0) {
    console.error(`Batch had ${errors.length} delete errors`);
    for (const error of errors.slice(0, 10)) {
      console.error(
        `  - ${error.Key} (${error.VersionId}): ${error.Code} ${error.Message}`,
      );
    }
    if (errors.length > 10) {
      console.error(`  ...and ${errors.length - 10} more errors`);
    }
  }

  return deleted;
}

async function cleanupNonCurrentVersions(): Promise<void> {
  const cli = getCliOptions(process.argv.slice(2));

  const bucket = cli.bucket ?? process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;

  if (!bucket || !region || !endpoint || !key || !secret) {
    throw new Error(
      'Missing required config. Ensure DO_SPACES_BUCKET, DO_SPACES_REGION, DO_SPACES_ENDPOINT, DO_SPACES_KEY, and DO_SPACES_SECRET are set.',
    );
  }

  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle: false,
    credentials: {
      accessKeyId: key,
      secretAccessKey: secret,
    },
  });

  console.log('Starting Spaces version cleanup');
  console.log(`Bucket: ${bucket}`);
  if (cli.prefix) {
    console.log(`Prefix filter: ${cli.prefix}`);
  }
  console.log(
    `Mode: ${cli.execute ? 'EXECUTE (will permanently delete versions)' : 'DRY RUN (no deletions)'}`,
  );

  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  let scannedVersions = 0;
  let scannedDeleteMarkers = 0;
  let candidateOldVersions = 0;
  let candidateDeleteMarkers = 0;
  let deletedTotal = 0;

  const batchSize = 500;

  do {
    const response = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: cli.prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );

    const toDelete: ObjectIdentifier[] = [];

    for (const version of response.Versions ?? []) {
      scannedVersions += 1;
      if (!version.IsLatest && version.Key && version.VersionId) {
        candidateOldVersions += 1;
        toDelete.push({ Key: version.Key, VersionId: version.VersionId });
      }
    }

    for (const marker of response.DeleteMarkers ?? []) {
      scannedDeleteMarkers += 1;
      if (marker.Key && marker.VersionId) {
        candidateDeleteMarkers += 1;
        toDelete.push({ Key: marker.Key, VersionId: marker.VersionId });
      }
    }

    if (toDelete.length > 0) {
      if (cli.execute) {
        for (let i = 0; i < toDelete.length; i += batchSize) {
          const chunk = toDelete.slice(i, i + batchSize);
          const deleted = await deleteBatch(s3, bucket, chunk);
          deletedTotal += deleted;
        }
      } else {
        console.log(
          `Would delete ${toDelete.length} versioned items in this page`,
        );
      }
    }

    keyMarker = response.NextKeyMarker;
    versionIdMarker = response.NextVersionIdMarker;

    console.log(
      `Progress: scannedVersions=${scannedVersions}, scannedDeleteMarkers=${scannedDeleteMarkers}, candidates=${candidateOldVersions + candidateDeleteMarkers}, deleted=${deletedTotal}`,
    );
  } while (keyMarker);

  console.log('Cleanup summary');
  console.log(`  Non-current versions found: ${candidateOldVersions}`);
  console.log(`  Delete markers found: ${candidateDeleteMarkers}`);
  console.log(
    `  Total candidates: ${candidateOldVersions + candidateDeleteMarkers}`,
  );
  if (cli.execute) {
    console.log(`  Total deleted: ${deletedTotal}`);
  } else {
    console.log('  Dry run only. Re-run with --execute to delete permanently.');
  }
}

cleanupNonCurrentVersions().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
