/**
 * FixLink Stage 6A — MySQL marketplace store (production implementation).
 *
 * Every value is a bound parameter — no string-interpolated SQL. LIKE
 * patterns escape `%`, `_` and `\` so search input cannot widen matches.
 * Only public columns are selected: certificate `document_reference`,
 * identity verification data, user credentials and customer contact
 * details are never read here and can never leak into responses.
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { MarketplaceStore } from './marketplace.store';
import type {
  CertificateDto,
  Paginated,
  PortfolioImageDto,
  PortfolioProjectDto,
  ProviderCardDto,
  ProviderProfileDto,
  ProviderSearchFilters,
  ReviewDto,
  ServiceCategoryDto,
  ServiceDto,
} from './marketplace.types';

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * DATE column → 'YYYY-MM-DD'. mysql2 returns DATEs as local-midnight Dates,
 * so UTC conversion would shift the calendar day — use local parts instead.
 */
function toDateOnly(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toStringId(value: number | string): string {
  return String(value);
}

/** Escape a LIKE needle so `%`, `_` and `\` match literally. */
function escapeLike(needle: string): string {
  return needle.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function likePattern(needle: string): string {
  return `%${escapeLike(needle.trim())}%`;
}

function isNumericRef(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

interface ServiceRow extends RowDataPacket {
  id: number;
  category_id: number;
  category_name: string;
  category_slug: string;
  name: string;
  slug: string;
  description: string | null;
}

interface CategoryRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

interface ProfessionalRow extends RowDataPacket {
  id: number;
  display_name: string;
  bio: string | null;
  experience_years: number | null;
  profile_photo_reference: string | null;
  verification_status: ProviderCardDto['verificationStatus'];
  rating_avg: number | string;
  rating_count: number;
  portfolio_count: number;
  certificate_count: number;
}

interface BusinessRow extends RowDataPacket {
  id: number;
  business_name: string;
  description: string | null;
  logo_reference: string | null;
  city: string | null;
  province: string | null;
  verification_status: ProviderCardDto['verificationStatus'];
  rating_avg: number | string;
  rating_count: number;
  portfolio_count: number;
  certificate_count: number;
}

interface ProviderServiceRow extends RowDataPacket {
  owner_id: number;
  service_id: number;
  service_name: string;
  service_slug: string;
}

interface AreaRow extends RowDataPacket {
  owner_id: number;
  area_name: string;
  city: string | null;
  province: string | null;
}

export class MysqlMarketplaceStore implements MarketplaceStore {
  constructor(private readonly pool: Pool) {}

  async listCategories(activeOnly: boolean): Promise<ServiceCategoryDto[]> {
    const [rows] = await this.pool.query<CategoryRow[]>(
      `SELECT \`id\`, \`name\`, \`slug\`, \`description\`
         FROM \`service_categories\`
        WHERE (? = 0 OR \`is_active\` = 1)
        ORDER BY \`sort_order\`, \`name\``,
      [activeOnly ? 1 : 0],
    );
    return rows.map((row) => ({
      id: toStringId(row.id),
      name: row.name,
      slug: row.slug,
      description: row.description,
    }));
  }

  async getCategoryById(id: string): Promise<ServiceCategoryDto | null> {
    const [rows] = await this.pool.query<CategoryRow[]>(
      'SELECT `id`, `name`, `slug`, `description` FROM `service_categories` WHERE `id` = ? LIMIT 1',
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0] as CategoryRow;
    return { id: toStringId(row.id), name: row.name, slug: row.slug, description: row.description };
  }

  async listServices(activeOnly: boolean): Promise<ServiceDto[]> {
    const [rows] = await this.pool.query<ServiceRow[]>(
      `SELECT s.\`id\`, s.\`category_id\`, c.\`name\` AS \`category_name\`, c.\`slug\` AS \`category_slug\`,
              s.\`name\`, s.\`slug\`, s.\`description\`
         FROM \`services\` s
         INNER JOIN \`service_categories\` c ON c.\`id\` = s.\`category_id\`
        WHERE (? = 0 OR (s.\`is_active\` = 1 AND c.\`is_active\` = 1))
        ORDER BY c.\`sort_order\`, s.\`sort_order\`, s.\`name\``,
      [activeOnly ? 1 : 0],
    );
    return rows.map((row) => ({
      id: toStringId(row.id),
      categoryId: toStringId(row.category_id),
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      name: row.name,
      slug: row.slug,
      description: row.description,
    }));
  }

  async getServiceById(id: string): Promise<ServiceDto | null> {
    const [rows] = await this.pool.query<ServiceRow[]>(
      `SELECT s.\`id\`, s.\`category_id\`, c.\`name\` AS \`category_name\`, c.\`slug\` AS \`category_slug\`,
              s.\`name\`, s.\`slug\`, s.\`description\`
         FROM \`services\` s
         INNER JOIN \`service_categories\` c ON c.\`id\` = s.\`category_id\`
        WHERE s.\`id\` = ? LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0] as ServiceRow;
    return {
      id: toStringId(row.id),
      categoryId: toStringId(row.category_id),
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      name: row.name,
      slug: row.slug,
      description: row.description,
    };
  }

  async searchProviders(filters: ProviderSearchFilters): Promise<Paginated<ProviderCardDto>> {
    const cards: ProviderCardDto[] = [];
    if (filters.providerType !== 'business') {
      cards.push(...(await this.searchProfessionals(filters)));
    }
    if (filters.providerType !== 'professional') {
      cards.push(...(await this.searchBusinesses(filters)));
    }
    cards.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
    const total = cards.length;
    const start = (filters.page - 1) * filters.pageSize;
    return { items: cards.slice(start, start + filters.pageSize), total, page: filters.page, pageSize: filters.pageSize };
  }

  private serviceExistsClause(
    linkTable: 'professional_services' | 'business_services',
    ownerColumn: 'professional_id' | 'business_id',
    profileAlias: 'pp' | 'bp',
    filter: string,
    params: unknown[],
  ): string {
    if (isNumericRef(filter)) {
      params.push(filter);
      return `EXISTS (SELECT 1 FROM \`${linkTable}\` l WHERE l.\`${ownerColumn}\` = \`${profileAlias}\`.\`id\` AND l.\`service_id\` = ?)`;
    }
    params.push(filter, likePattern(filter));
    return `EXISTS (SELECT 1 FROM \`${linkTable}\` l
      INNER JOIN \`services\` s ON s.\`id\` = l.\`service_id\`
      WHERE l.\`${ownerColumn}\` = \`${profileAlias}\`.\`id\`
        AND (s.\`slug\` = ? OR s.\`name\` LIKE ? ESCAPE '\\\\'))`;
  }

  private categoryExistsClause(
    linkTable: 'professional_services' | 'business_services',
    ownerColumn: 'professional_id' | 'business_id',
    profileAlias: 'pp' | 'bp',
    filter: string,
    params: unknown[],
  ): string {
    if (isNumericRef(filter)) {
      params.push(filter);
      return `EXISTS (SELECT 1 FROM \`${linkTable}\` l
        INNER JOIN \`services\` s ON s.\`id\` = l.\`service_id\`
        WHERE l.\`${ownerColumn}\` = \`${profileAlias}\`.\`id\` AND s.\`category_id\` = ?)`;
    }
    params.push(filter, likePattern(filter));
    return `EXISTS (SELECT 1 FROM \`${linkTable}\` l
      INNER JOIN \`services\` s ON s.\`id\` = l.\`service_id\`
      INNER JOIN \`service_categories\` c ON c.\`id\` = s.\`category_id\`
      WHERE l.\`${ownerColumn}\` = \`${profileAlias}\`.\`id\`
        AND (c.\`slug\` = ? OR c.\`name\` LIKE ? ESCAPE '\\\\'))`;
  }

  private async searchProfessionals(filters: ProviderSearchFilters): Promise<ProviderCardDto[]> {
    const conditions = ['pp.`is_active` = 1', 'pp.`deleted_at` IS NULL'];
    const params: unknown[] = [];
    if (filters.verifiedOnly) conditions.push("pp.`verification_status` = 'VERIFIED'");
    if (filters.service) {
      conditions.push(this.serviceExistsClause('professional_services', 'professional_id', 'pp', filters.service, params));
    }
    if (filters.category) {
      conditions.push(this.categoryExistsClause('professional_services', 'professional_id', 'pp', filters.category, params));
    }
    if (filters.location) {
      const pattern = likePattern(filters.location);
      params.push(pattern, pattern, pattern);
      conditions.push(`EXISTS (SELECT 1 FROM \`service_areas\` sa
        WHERE sa.\`professional_id\` = pp.\`id\`
          AND (sa.\`area_name\` LIKE ? ESCAPE '\\\\' OR sa.\`city\` LIKE ? ESCAPE '\\\\' OR sa.\`province\` LIKE ? ESCAPE '\\\\'))`);
    }
    if (filters.query) {
      const words = filters.query.split(/\s+/).filter(Boolean).slice(0, 8);
      for (const word of words) {
        const pattern = likePattern(word);
        params.push(pattern, pattern, pattern);
        conditions.push(`(pp.\`display_name\` LIKE ? ESCAPE '\\\\' OR pp.\`bio\` LIKE ? ESCAPE '\\\\'
          OR EXISTS (SELECT 1 FROM \`professional_services\` lq
            INNER JOIN \`services\` sq ON sq.\`id\` = lq.\`service_id\`
            WHERE lq.\`professional_id\` = pp.\`id\` AND sq.\`name\` LIKE ? ESCAPE '\\\\'))`);
      }
    }
    const [rows] = await this.pool.query<ProfessionalRow[]>(
      `SELECT pp.\`id\`, pp.\`display_name\`, pp.\`bio\`, pp.\`experience_years\`,
              pp.\`verification_status\`,
              pp.\`rating_avg\`, pp.\`rating_count\`,
              (SELECT COUNT(*) FROM \`portfolio_projects\` pf
                WHERE pf.\`professional_id\` = pp.\`id\` AND pf.\`is_published\` = 1 AND pf.\`deleted_at\` IS NULL) AS \`portfolio_count\`,
              (SELECT COUNT(*) FROM \`certificates\` cf
                WHERE cf.\`professional_id\` = pp.\`id\` AND cf.\`verification_status\` = 'APPROVED' AND cf.\`deleted_at\` IS NULL) AS \`certificate_count\`
         FROM \`professional_profiles\` pp
        WHERE ${conditions.join(' AND ')}
        ORDER BY pp.\`rating_avg\` DESC, pp.\`rating_count\` DESC
        LIMIT 200`,
      params,
    );
    if (rows.length === 0) return [];
    const ids = rows.map((row) => toStringId(row.id));
    const servicesByOwner = await this.loadServices('professional_services', 'professional_id', ids);
    const areasByOwner = await this.loadAreas('professional_id', ids);
    return rows.map((row) => {
      const id = toStringId(row.id);
      const areas = areasByOwner.get(id) ?? [];
      return {
        id: `professional-${id}`,
        providerType: 'professional' as const,
        name: row.display_name,
        description: row.bio,
        city: areas[0]?.city ?? null,
        province: areas[0]?.province ?? null,
        verificationStatus: row.verification_status,
        isVerified: row.verification_status === 'VERIFIED',
        ratingAvg: Number(row.rating_avg),
        ratingCount: row.rating_count,
        experienceYears: row.experience_years,
        services: servicesByOwner.get(id) ?? [],
        serviceAreas: areas,
        portfolioCount: Number(row.portfolio_count),
        approvedCertificateCount: Number(row.certificate_count),
      };
    });
  }

  private async searchBusinesses(filters: ProviderSearchFilters): Promise<ProviderCardDto[]> {
    const conditions = ['bp.`is_active` = 1', 'bp.`deleted_at` IS NULL'];
    const params: unknown[] = [];
    if (filters.verifiedOnly) conditions.push("bp.`verification_status` = 'VERIFIED'");
    if (filters.service) {
      conditions.push(this.serviceExistsClause('business_services', 'business_id', 'bp', filters.service, params));
    }
    if (filters.category) {
      conditions.push(this.categoryExistsClause('business_services', 'business_id', 'bp', filters.category, params));
    }
    if (filters.location) {
      const pattern = likePattern(filters.location);
      params.push(pattern, pattern, pattern, pattern);
      conditions.push(`(bp.\`city\` LIKE ? ESCAPE '\\\\'
        OR EXISTS (SELECT 1 FROM \`service_areas\` sa
          WHERE sa.\`business_id\` = bp.\`id\`
            AND (sa.\`area_name\` LIKE ? ESCAPE '\\\\' OR sa.\`city\` LIKE ? ESCAPE '\\\\' OR sa.\`province\` LIKE ? ESCAPE '\\\\')))`);
    }
    if (filters.query) {
      const words = filters.query.split(/\s+/).filter(Boolean).slice(0, 8);
      for (const word of words) {
        const pattern = likePattern(word);
        params.push(pattern, pattern, pattern);
        conditions.push(`(bp.\`business_name\` LIKE ? ESCAPE '\\\\' OR bp.\`description\` LIKE ? ESCAPE '\\\\'
          OR EXISTS (SELECT 1 FROM \`business_services\` lq
            INNER JOIN \`services\` sq ON sq.\`id\` = lq.\`service_id\`
            WHERE lq.\`business_id\` = bp.\`id\` AND sq.\`name\` LIKE ? ESCAPE '\\\\'))`);
      }
    }
    const [rows] = await this.pool.query<BusinessRow[]>(
      `SELECT bp.\`id\`, bp.\`business_name\`, bp.\`description\`,
              bp.\`city\`, bp.\`province\`, bp.\`verification_status\`,
              bp.\`rating_avg\`, bp.\`rating_count\`,
              (SELECT COUNT(*) FROM \`portfolio_projects\` pf
                WHERE pf.\`business_id\` = bp.\`id\` AND pf.\`is_published\` = 1 AND pf.\`deleted_at\` IS NULL) AS \`portfolio_count\`,
              (SELECT COUNT(*) FROM \`certificates\` cf
                WHERE cf.\`business_id\` = bp.\`id\` AND cf.\`verification_status\` = 'APPROVED' AND cf.\`deleted_at\` IS NULL) AS \`certificate_count\`
         FROM \`business_profiles\` bp
        WHERE ${conditions.join(' AND ')}
        ORDER BY bp.\`rating_avg\` DESC, bp.\`rating_count\` DESC
        LIMIT 200`,
      params,
    );
    if (rows.length === 0) return [];
    const ids = rows.map((row) => toStringId(row.id));
    const servicesByOwner = await this.loadServices('business_services', 'business_id', ids);
    const areasByOwner = await this.loadAreas('business_id', ids);
    return rows.map((row) => {
      const id = toStringId(row.id);
      return {
        id: `business-${id}`,
        providerType: 'business' as const,
        name: row.business_name,
        description: row.description,
        city: row.city,
        province: row.province,
        verificationStatus: row.verification_status,
        isVerified: row.verification_status === 'VERIFIED',
        ratingAvg: Number(row.rating_avg),
        ratingCount: row.rating_count,
        experienceYears: null,
        services: servicesByOwner.get(id) ?? [],
        serviceAreas: areasByOwner.get(id) ?? [],
        portfolioCount: Number(row.portfolio_count),
        approvedCertificateCount: Number(row.certificate_count),
      };
    });
  }

  private async loadServices(
    linkTable: 'professional_services' | 'business_services',
    ownerColumn: 'professional_id' | 'business_id',
    ownerIds: string[],
  ): Promise<Map<string, { id: string; name: string; slug: string }[]>> {
    const placeholders = ownerIds.map(() => '?').join(',');
    const [rows] = await this.pool.query<ProviderServiceRow[]>(
      `SELECT l.\`${ownerColumn}\` AS \`owner_id\`, s.\`id\` AS \`service_id\`, s.\`name\` AS \`service_name\`, s.\`slug\` AS \`service_slug\`
         FROM \`${linkTable}\` l
         INNER JOIN \`services\` s ON s.\`id\` = l.\`service_id\`
        WHERE l.\`${ownerColumn}\` IN (${placeholders})
        ORDER BY s.\`name\``,
      ownerIds,
    );
    const grouped = new Map<string, { id: string; name: string; slug: string }[]>();
    for (const row of rows) {
      const key = toStringId(row.owner_id);
      const list = grouped.get(key) ?? [];
      list.push({ id: toStringId(row.service_id), name: row.service_name, slug: row.service_slug });
      grouped.set(key, list);
    }
    return grouped;
  }

  private async loadAreas(
    ownerColumn: 'professional_id' | 'business_id',
    ownerIds: string[],
  ): Promise<Map<string, { areaName: string; city: string | null; province: string | null }[]>> {
    const placeholders = ownerIds.map(() => '?').join(',');
    const [rows] = await this.pool.query<AreaRow[]>(
      `SELECT \`${ownerColumn}\` AS \`owner_id\`, \`area_name\`, \`city\`, \`province\`
         FROM \`service_areas\`
        WHERE \`${ownerColumn}\` IN (${placeholders})
        ORDER BY \`area_name\``,
      ownerIds,
    );
    const grouped = new Map<string, { areaName: string; city: string | null; province: string | null }[]>();
    for (const row of rows) {
      const key = toStringId(row.owner_id);
      const list = grouped.get(key) ?? [];
      list.push({ areaName: row.area_name, city: row.city, province: row.province });
      grouped.set(key, list);
    }
    return grouped;
  }

  async getProviderById(providerId: string): Promise<ProviderProfileDto | null> {
    const match = /^(professional|business)-([1-9][0-9]*)$/.exec(providerId.trim());
    if (!match) return null;
    const type = match[1] as 'professional' | 'business';
    const numericId = match[2] as string;
    if (type === 'professional') {
      const [rows] = await this.pool.query<ProfessionalRow[]>(
        `SELECT pp.\`id\`, pp.\`display_name\`, pp.\`bio\`, pp.\`experience_years\`,
                pp.\`verification_status\`,
                pp.\`rating_avg\`, pp.\`rating_count\`,
                (SELECT COUNT(*) FROM \`portfolio_projects\` pf
                  WHERE pf.\`professional_id\` = pp.\`id\` AND pf.\`is_published\` = 1 AND pf.\`deleted_at\` IS NULL) AS \`portfolio_count\`,
                (SELECT COUNT(*) FROM \`certificates\` cf
                  WHERE cf.\`professional_id\` = pp.\`id\` AND cf.\`verification_status\` = 'APPROVED' AND cf.\`deleted_at\` IS NULL) AS \`certificate_count\`
           FROM \`professional_profiles\` pp
          WHERE pp.\`id\` = ? AND pp.\`is_active\` = 1 AND pp.\`deleted_at\` IS NULL
          LIMIT 1`,
        [numericId],
      );
      if (rows.length === 0) return null;
      const row = rows[0] as ProfessionalRow;
      const id = toStringId(row.id);
      const servicesByOwner = await this.loadServices('professional_services', 'professional_id', [id]);
      const areasByOwner = await this.loadAreas('professional_id', [id]);
      const areas = areasByOwner.get(id) ?? [];
      return {
        id: `professional-${id}`,
        providerType: 'professional',
        name: row.display_name,
        description: row.bio,
        bio: row.bio,
        city: areas[0]?.city ?? null,
        province: areas[0]?.province ?? null,
        verificationStatus: row.verification_status,
        isVerified: row.verification_status === 'VERIFIED',
        ratingAvg: Number(row.rating_avg),
        ratingCount: row.rating_count,
        experienceYears: row.experience_years,
        services: servicesByOwner.get(id) ?? [],
        serviceAreas: areas,
        portfolioCount: Number(row.portfolio_count),
        approvedCertificateCount: Number(row.certificate_count),
      };
    }
    const [rows] = await this.pool.query<BusinessRow[]>(
      `SELECT bp.\`id\`, bp.\`business_name\`, bp.\`description\`,
              bp.\`city\`, bp.\`province\`, bp.\`verification_status\`,
              bp.\`rating_avg\`, bp.\`rating_count\`,
              (SELECT COUNT(*) FROM \`portfolio_projects\` pf
                WHERE pf.\`business_id\` = bp.\`id\` AND pf.\`is_published\` = 1 AND pf.\`deleted_at\` IS NULL) AS \`portfolio_count\`,
              (SELECT COUNT(*) FROM \`certificates\` cf
                WHERE cf.\`business_id\` = bp.\`id\` AND cf.\`verification_status\` = 'APPROVED' AND cf.\`deleted_at\` IS NULL) AS \`certificate_count\`
         FROM \`business_profiles\` bp
        WHERE bp.\`id\` = ? AND bp.\`is_active\` = 1 AND bp.\`deleted_at\` IS NULL
        LIMIT 1`,
      [numericId],
    );
    if (rows.length === 0) return null;
    const row = rows[0] as BusinessRow;
    const id = toStringId(row.id);
    const servicesByOwner = await this.loadServices('business_services', 'business_id', [id]);
    const areasByOwner = await this.loadAreas('business_id', [id]);
    return {
      id: `business-${id}`,
      providerType: 'business',
      name: row.business_name,
      description: row.description,
      bio: row.description,
      city: row.city,
      province: row.province,
      verificationStatus: row.verification_status,
      isVerified: row.verification_status === 'VERIFIED',
      ratingAvg: Number(row.rating_avg),
      ratingCount: row.rating_count,
      experienceYears: null,
      services: servicesByOwner.get(id) ?? [],
      serviceAreas: areasByOwner.get(id) ?? [],
      portfolioCount: Number(row.portfolio_count),
      approvedCertificateCount: Number(row.certificate_count),
    };
  }

  async getProviderPortfolio(providerId: string): Promise<PortfolioProjectDto[]> {
    const match = /^(professional|business)-([1-9][0-9]*)$/.exec(providerId.trim());
    if (!match) return [];
    const type = match[1] as 'professional' | 'business';
    const numericId = match[2] as string;
    const ownerColumn = type === 'professional' ? 'professional_id' : 'business_id';
    interface ProjectRow extends RowDataPacket {
      id: number;
      title: string;
      description: string | null;
      service_id: number | null;
      service_name: string | null;
      service_slug: string | null;
      created_at: Date | string;
    }
    const [projects] = await this.pool.query<ProjectRow[]>(
      `SELECT p.\`id\`, p.\`title\`, p.\`description\`, p.\`service_id\`,
              s.\`name\` AS \`service_name\`, s.\`slug\` AS \`service_slug\`, p.\`created_at\`
         FROM \`portfolio_projects\` p
         LEFT JOIN \`services\` s ON s.\`id\` = p.\`service_id\`
        WHERE p.\`${ownerColumn}\` = ? AND p.\`is_published\` = 1 AND p.\`deleted_at\` IS NULL
        ORDER BY p.\`created_at\` DESC`,
      [numericId],
    );
    if (projects.length === 0) return [];
    interface ImageRow extends RowDataPacket {
      id: number;
      project_id: number;
      mime_type: string | null;
      kind: PortfolioImageDto['kind'];
      sort_order: number;
    }
    const projectIds = projects.map((p) => toStringId(p.id));
    const placeholders = projectIds.map(() => '?').join(',');
    const [images] = await this.pool.query<ImageRow[]>(
      `SELECT \`id\`, \`project_id\`, \`mime_type\`, \`kind\`, \`sort_order\`
         FROM \`portfolio_images\`
        WHERE \`project_id\` IN (${placeholders})
        ORDER BY \`sort_order\`, \`id\``,
      projectIds,
    );
    const imagesByProject = new Map<string, PortfolioImageDto[]>();
    for (const image of images) {
      const key = toStringId(image.project_id);
      const list = imagesByProject.get(key) ?? [];
      list.push({
        id: toStringId(image.id),
        mimeType: image.mime_type,
        kind: image.kind,
        sortOrder: image.sort_order,
      });
      imagesByProject.set(key, list);
    }
    return projects.map((project) => {
      const id = toStringId(project.id);
      return {
        id,
        title: project.title,
        description: project.description,
        service:
          project.service_id === null
            ? null
            : { id: toStringId(project.service_id), name: project.service_name ?? '', slug: project.service_slug ?? '' },
        images: imagesByProject.get(id) ?? [],
        createdAt: toIso(project.created_at) ?? new Date(0).toISOString(),
      };
    });
  }

  async getProviderCertificates(providerId: string): Promise<CertificateDto[]> {
    const match = /^(professional|business)-([1-9][0-9]*)$/.exec(providerId.trim());
    if (!match) return [];
    const type = match[1] as 'professional' | 'business';
    const numericId = match[2] as string;
    const ownerColumn = type === 'professional' ? 'professional_id' : 'business_id';
    interface CertificateRow extends RowDataPacket {
      id: number;
      title: string;
      issuing_organisation: string | null;
      issue_date: Date | string | null;
      expiry_date: Date | string | null;
    }
    // NOTE: `document_reference` is intentionally NOT selected — private file.
    const [rows] = await this.pool.query<CertificateRow[]>(
      `SELECT \`id\`, \`title\`, \`issuing_organisation\`, \`issue_date\`, \`expiry_date\`
         FROM \`certificates\`
        WHERE \`${ownerColumn}\` = ?
          AND \`verification_status\` = 'APPROVED'
          AND \`deleted_at\` IS NULL
        ORDER BY \`created_at\` DESC`,
      [numericId],
    );
    return rows.map((row) => ({
      id: toStringId(row.id),
      title: row.title,
      issuingOrganisation: row.issuing_organisation,
      issueDate: toDateOnly(row.issue_date),
      expiryDate: toDateOnly(row.expiry_date),
      verificationStatus: 'APPROVED' as const,
    }));
  }

  async getProviderReviews(providerId: string, page: number, pageSize: number): Promise<Paginated<ReviewDto>> {
    const match = /^(professional|business)-([1-9][0-9]*)$/.exec(providerId.trim());
    if (!match) return { items: [], total: 0, page, pageSize };
    const type = match[1] as 'professional' | 'business';
    const numericId = match[2] as string;
    const ownerColumn = type === 'professional' ? 'professional_id' : 'business_id';
    interface CountRow extends RowDataPacket {
      total: number;
    }
    const [countRows] = await this.pool.query<CountRow[]>(
      `SELECT COUNT(*) AS \`total\` FROM \`reviews\`
        WHERE \`${ownerColumn}\` = ? AND \`is_visible\` = 1`,
      [numericId],
    );
    const total = Number((countRows[0] as CountRow | undefined)?.total ?? 0);
    if (total === 0) return { items: [], total: 0, page, pageSize };
    interface ReviewRow extends RowDataPacket {
      id: number;
      rating: number;
      comment: string | null;
      first_name: string | null;
      last_name: string | null;
      created_at: Date | string;
    }
    const offset = (page - 1) * pageSize;
    const [rows] = await this.pool.query<ReviewRow[]>(
      `SELECT r.\`id\`, r.\`rating\`, r.\`comment\`, cp.\`first_name\`, cp.\`last_name\`, r.\`created_at\`
         FROM \`reviews\` r
         INNER JOIN \`customer_profiles\` cp ON cp.\`id\` = r.\`customer_id\`
        WHERE r.\`${ownerColumn}\` = ? AND r.\`is_visible\` = 1
        ORDER BY r.\`created_at\` DESC
        LIMIT ? OFFSET ?`,
      [numericId, pageSize, offset],
    );
    return {
      items: rows.map((row) => ({
        id: toStringId(row.id),
        rating: row.rating,
        comment: row.comment,
        reviewerName: formatReviewerName(row.first_name, row.last_name),
        createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }
}

/** "Aisha Patel" -> "Aisha P." — never expose customer contact details. */
export function formatReviewerName(firstName: string | null, lastName: string | null): string {
  const first = (firstName ?? '').trim();
  const lastInitial = (lastName ?? '').trim().charAt(0);
  if (first && lastInitial) return `${first} ${lastInitial}.`;
  if (first) return first;
  return 'Verified customer';
}
