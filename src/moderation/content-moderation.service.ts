import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { RekognitionClient, DetectModerationLabelsCommand, ModerationLabel } from '@aws-sdk/client-rekognition';

type Provider = 'none' | 'rekognition';

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);
  private provider: Provider;
  private rekognition?: RekognitionClient;

  // Labels that indicate explicit or sexual content to block
  private static readonly DEFAULT_BLOCK_LABELS = new Set<string>([
    'Explicit Nudity',
    'Nudity',
    'Sexual Activity',
    'Sexual Situations',
    'Graphic Male Nudity',
    'Graphic Female Nudity',
    'Graphic Sexual Activity',
    'Suggestive',
    'Revealing Clothes',
    'Partial Nudity',
    'Male Swimwear Or Underwear',
    'Female Swimwear Or Underwear',
  ]);

  constructor() {
    this.provider = (process.env.MODERATION_PROVIDER as Provider) || 'none';
    if (this.provider === 'rekognition') {
      const region = process.env.AWS_REGION || process.env.REKOGNITION_REGION;
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      if (!region || !accessKeyId || !secretAccessKey) {
        this.logger.warn(
          'Rekognition selected but AWS credentials/region missing. Moderation will be disabled (provider=none).',
        );
        this.provider = 'none';
      } else {
        this.rekognition = new RekognitionClient({ region, credentials: { accessKeyId, secretAccessKey } });
      }
    }
  }

  /**
   * Throws BadRequestException if image is unsafe according to configured provider.
   */
  async assertImageIsSafe(buffer: Buffer, mimeType?: string): Promise<void> {
    if (this.provider === 'none') return; // no-op
    if (this.provider === 'rekognition') {
      await this.checkWithRekognition(buffer);
      return;
    }
  }

  /** Analyze an image and return moderation labels. */
  async analyzeImage(buffer: Buffer): Promise<ModerationLabel[]> {
    if (this.provider !== 'rekognition' || !this.rekognition) return [];
    const minConfidence = Number(process.env.MODERATION_MIN_CONFIDENCE || 80);
    const res = await this.rekognition.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: buffer },
        MinConfidence: Math.min(Math.max(minConfidence, 0), 100),
      }),
    );
    return res.ModerationLabels || [];
  }

  /** Decide whether labels indicate explicit/sexual content (config honors suggestive toggle). */
  isExplicit(labels: Pick<ModerationLabel, 'Name' | 'ParentName' | 'Confidence'>[]): {
    explicit: boolean;
    matched: string[];
  } {
    const minConfidence = Number(process.env.MODERATION_MIN_CONFIDENCE || 80);
    const allowSuggestive = /^true$/i.test(process.env.MODERATION_ALLOW_SUGGESTIVE || 'false');
    const blockLabels = new Set(ContentModerationService.DEFAULT_BLOCK_LABELS);
    if (allowSuggestive) {
      blockLabels.delete('Suggestive');
      blockLabels.delete('Revealing Clothes');
      blockLabels.delete('Male Swimwear Or Underwear');
      blockLabels.delete('Female Swimwear Or Underwear');
    }
    const matched: string[] = [];
    for (const l of labels) {
      const name = (l.Name || '').toString();
      const parent = (l.ParentName || '').toString();
      const conf = Number(l.Confidence || 0);
      if (conf < minConfidence) continue;
      if (blockLabels.has(name) || blockLabels.has(parent)) matched.push(name || parent);
    }
    return { explicit: matched.length > 0, matched };
  }

  private async checkWithRekognition(buffer: Buffer): Promise<void> {
    if (!this.rekognition) return; // defensive
    const minConfidence = Number(process.env.MODERATION_MIN_CONFIDENCE || 80);
    const allowSuggestive = /^true$/i.test(process.env.MODERATION_ALLOW_SUGGESTIVE || 'false');

    const res = await this.rekognition.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: buffer },
        MinConfidence: Math.min(Math.max(minConfidence, 0), 100),
      }),
    );
    const labels = res.ModerationLabels || [];

    // Build block label set with optional suggestive allowance
    const blockLabels = new Set(ContentModerationService.DEFAULT_BLOCK_LABELS);
    if (allowSuggestive) {
      blockLabels.delete('Suggestive');
      blockLabels.delete('Revealing Clothes');
      blockLabels.delete('Male Swimwear Or Underwear');
      blockLabels.delete('Female Swimwear Or Underwear');
    }

    for (const l of labels) {
      const name = (l.Name || '').toString();
      const parent = (l.ParentName || '').toString();
      const conf = Number(l.Confidence || 0);
      if (conf < minConfidence) continue;
      if (blockLabels.has(name) || blockLabels.has(parent)) {
        this.logger.warn(`Blocked image by moderation: ${name} (${conf.toFixed(1)}%)`);
        throw new BadRequestException('The uploaded image violates our content policy.');
      }
    }
  }
}