import { IsNull, type EntityManager } from "typeorm";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import {
  AgendamentoEntity,
  EvolucaoClinicaEntity,
  MedicoEntity,
  PatientEntity,
  UserEntity,
  type Medico,
  type User,
} from "@/lib/db/entities";
import {
  parseEspecialidadeUsuario,
  type EspecialidadeSelecaoCodigo,
} from "@/lib/especialidades-clinica";

export interface MedicoResponsavelDTO {
  id: string;
  nome: string;
  especialidade: string | null;
  especialidadeCodigo?: EspecialidadeSelecaoCodigo | null;
  especialidadePrincipal?: string | null;
  subespecialidade?: string | null;
  corHex?: string;
  crm: string | null;
}

type UserMedicoProjection = Pick<
  User,
  | "id"
  | "title"
  | "fullName"
  | "specialty"
  | "councilType"
  | "councilNumber"
  | "cargo"
  | "role"
  | "isClinical"
  | "accountStatus"
  | "organizationId"
>;

const CARGOS_MEDICOS = new Set(["DONO_CLINICA", "MEDICO"]);
const ROLES_MEDICOS = new Set(["CLINIC_ADMIN", "DOCTOR"]);

export function formatarNomeMedico(
  title?: string | null,
  fullName?: string | null,
): string {
  const rawName = (fullName || "").trim();
  const rawTitle = (title || "").trim();
  if (!rawName) return rawTitle;
  if (rawTitle && !rawName.toLowerCase().startsWith(rawTitle.toLowerCase())) {
    return `${rawTitle} ${rawName}`;
  }
  return rawName;
}

export function formatarCrmMedico(
  councilType?: string | null,
  councilNumber?: string | null,
): string | null {
  const num = (councilNumber || "").trim();
  if (!num) return null;
  const type = (councilType || "").trim() || "CRM";
  if (num.toUpperCase().startsWith(type.toUpperCase())) {
    return num;
  }
  return `${type} ${num}`;
}

export function normalizarNomeMedicoComparacao(nome?: string | null): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(dra?\.?|prof\.?(a)?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUsuarioMedicoClinico(
  u: Pick<User, "cargo" | "role" | "isClinical">,
): boolean {
  if (u.role === "PATIENT") return false;
  if (u.cargo === "SECRETARIA" || u.role === "RECEPTIONIST") return false;
  if (u.cargo === "ADMINISTRADOR" || u.role === "ADMIN") return false;
  return (
    CARGOS_MEDICOS.has(String(u.cargo || "").toUpperCase()) ||
    ROLES_MEDICOS.has(String(u.role || "").toUpperCase())
  );
}

export function mapUserToMedicoResponsavel(
  user: Pick<
    User,
    "id" | "title" | "fullName" | "specialty" | "councilType" | "councilNumber"
  > | null | undefined,
): MedicoResponsavelDTO | null {
  if (!user) return null;
  const nome = formatarNomeMedico(user.title, user.fullName);
  if (!nome) return null;
  const parsedEsp = parseEspecialidadeUsuario(user.specialty);
  return {
    id: user.id,
    nome,
    especialidade: parsedEsp.exibicao,
    especialidadeCodigo: parsedEsp.codigo,
    especialidadePrincipal: parsedEsp.labelPrincipal,
    subespecialidade: parsedEsp.subespecialidade || null,
    corHex: parsedEsp.corHex,
    crm: formatarCrmMedico(user.councilType, user.councilNumber),
  };
}

/**
 * Busca e valida um profissional clínico ativo (MEDICO ou DONO_CLINICA) em USERS.
 */
export async function buscarUsuarioMedicoAtivo(
  userId: string | null | undefined,
  organizationId?: string | null,
  manager?: EntityManager,
): Promise<MedicoResponsavelDTO | null> {
  const cleanId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanId) return null;

  const findUser = async () => {
    if (manager) {
      return manager.getRepository(UserEntity).findOne({
        where: {
          id: cleanId,
          ...(organizationId ? { organizationId } : {}),
          deletedAt: IsNull(),
          accountStatus: "ACTIVE",
        },
        select: {
          id: true,
          title: true,
          fullName: true,
          specialty: true,
          councilType: true,
          councilNumber: true,
          cargo: true,
          role: true,
          isClinical: true,
          accountStatus: true,
          organizationId: true,
        },
      });
    }
    return withRepositoryRetry(
      UserEntity,
      (repo) =>
        repo.findOne({
          where: {
            id: cleanId,
            ...(organizationId ? { organizationId } : {}),
            deletedAt: IsNull(),
            accountStatus: "ACTIVE",
          },
          select: {
            id: true,
            title: true,
            fullName: true,
            specialty: true,
            councilType: true,
            councilNumber: true,
            cargo: true,
            role: true,
            isClinical: true,
            accountStatus: true,
            organizationId: true,
          },
        }),
      { label: "medico-responsavel:buscar-ativo" },
    );
  };

  const user = await findUser();
  if (!user || !isUsuarioMedicoClinico(user)) return null;
  return mapUserToMedicoResponsavel(user);
}

/**
 * Garante que exista um registro espelho na tabela MEDICOS com o MESMO ID do usuário
 * da Gestão da Equipe (USERS.ID), satisfazendo FK_AGEND_MEDICO no Oracle sem duplicar
 * cadastros nem quebrar agendamentos históricos.
 */
export async function garantirEspelhoMedicoAgenda(
  medico: Pick<
    MedicoResponsavelDTO,
    "id" | "nome" | "especialidade" | "corHex"
  >,
  manager?: EntityManager,
): Promise<Medico> {
  const medicoRepo = manager
    ? manager.getRepository(MedicoEntity)
    : await getRepository(MedicoEntity);

  const corFinal = medico.corHex || "#059669";
  const nomeFinal = medico.nome.trim().slice(0, 160);
  const espFinal = medico.especialidade
    ? medico.especialidade.trim().slice(0, 120)
    : null;

  const existente = await medicoRepo.findOne({ where: { id: medico.id } });
  if (existente) {
    if (
      existente.nome !== nomeFinal ||
      existente.especialidade !== espFinal ||
      existente.corHex !== corFinal
    ) {
      existente.nome = nomeFinal;
      existente.especialidade = espFinal;
      existente.corHex = corFinal;
      return medicoRepo.save(existente);
    }
    return existente;
  }

  return medicoRepo.save(
    medicoRepo.create({
      id: medico.id,
      nome: nomeFinal,
      especialidade: espFinal,
      corHex: corFinal,
    }),
  );
}

/**
 * Lista todos os médicos ativos da clínica cadastrados em USERS (com especialidade e CRM reais).
 * Usa projeção estrita sem CLOBs (compatível com poolMax: 2 no Oracle ADB).
 */
export async function listarMedicosClinica(
  organizationId?: string | null,
): Promise<MedicoResponsavelDTO[]> {
  const usuarios = await withRepositoryRetry(
    UserEntity,
    (repo) =>
      repo.find({
        where: {
          ...(organizationId ? { organizationId } : {}),
          deletedAt: IsNull(),
          accountStatus: "ACTIVE",
        },
        select: {
          id: true,
          title: true,
          fullName: true,
          specialty: true,
          councilType: true,
          councilNumber: true,
          cargo: true,
          role: true,
          isClinical: true,
          accountStatus: true,
          organizationId: true,
        },
        order: { fullName: "ASC" },
      }),
    { label: "medico-responsavel:listar-clinica" },
  );

  return (usuarios as UserMedicoProjection[])
    .filter((u) => isUsuarioMedicoClinico(u))
    .map((u) => mapUserToMedicoResponsavel(u))
    .filter((m): m is MedicoResponsavelDTO => m !== null);
}

/**
 * Valida e converte um ID de médico informado pelo cliente em um USERS.ID válido
 * para persistência em PATIENTS.PRIMARY_DOCTOR_ID (FK -> USERS.ID).
 */
export async function resolverUsuarioMedicoId(
  candidateId: string | null | undefined,
  organizationId?: string | null,
): Promise<string | null> {
  const cleanId = typeof candidateId === "string" ? candidateId.trim() : "";
  if (!cleanId) return null;

  const user = await withRepositoryRetry(
    UserEntity,
    (repo) =>
      repo.findOne({
        where: { id: cleanId, deletedAt: IsNull() },
        select: {
          id: true,
          role: true,
          cargo: true,
          isClinical: true,
        },
      }),
    { label: "medico-responsavel:validar-user" },
  );

  if (user && user.role !== "PATIENT") {
    return user.id;
  }

  // Fallback resiliente: se o ID recebido vier da tabela MEDICOS (Agenda),
  // tenta corresponder pelo nome normalizado em USERS para respeitar FK_PATIENTS_PRIMARY_DOCTOR.
  const medicoAgenda = await withRepositoryRetry(
    MedicoEntity,
    (repo) =>
      repo.findOne({
        where: { id: cleanId },
        select: { id: true, nome: true },
      }),
    { label: "medico-responsavel:fallback-medico-agenda" },
  );

  if (medicoAgenda?.nome) {
    const alvoNorm = normalizarNomeMedicoComparacao(medicoAgenda.nome);
    const medicosClinica = await listarMedicosClinica(organizationId);
    const match = medicosClinica.find(
      (m) => normalizarNomeMedicoComparacao(m.nome) === alvoNorm,
    );
    if (match) return match.id;
  }

  return null;
}

/**
 * Resolve o médico responsável real de um paciente seguindo a ordem de prioridade:
 * 1. Vínculo explícito em PATIENTS.PRIMARY_DOCTOR_ID -> USERS (nome, especialidade, CRM)
 * 2. Próximo agendamento ativo ou último agendamento/atendimento do paciente (enriquecido com CRM de USERS)
 * 3. Primeiro médico ativo da clínica quando houver apenas 1 médico cadastrado
 * Retorna null apenas se nenhum médico puder ser resolvido.
 */
export async function resolverMedicoResponsavel(
  pacienteId: string,
  opts?: {
    primaryDoctorId?: string | null;
    organizationId?: string | null;
  },
): Promise<MedicoResponsavelDTO | null> {
  let primaryDoctorId = opts?.primaryDoctorId;
  let organizationId = opts?.organizationId;

  if (primaryDoctorId === undefined || organizationId === undefined) {
    const paciente = await withRepositoryRetry(
      PatientEntity,
      (repo) =>
        repo.findOne({
          where: { id: pacienteId, deletedAt: IsNull() },
          select: {
            id: true,
            primaryDoctorId: true,
            organizationId: true,
          },
        }),
      { label: "medico-responsavel:paciente" },
    );

    if (!paciente) return null;
    if (primaryDoctorId === undefined) primaryDoctorId = paciente.primaryDoctorId;
    if (organizationId === undefined) organizationId = paciente.organizationId;
  }

  // 1. Médico explicitamente vinculado em PATIENTS.PRIMARY_DOCTOR_ID
  if (primaryDoctorId) {
    const userDoc = await withRepositoryRetry(
      UserEntity,
      (repo) =>
        repo.findOne({
          where: { id: primaryDoctorId, deletedAt: IsNull() },
          select: {
            id: true,
            title: true,
            fullName: true,
            specialty: true,
            councilType: true,
            councilNumber: true,
          },
        }),
      { label: "medico-responsavel:primary-doctor" },
    );

    const mapped = mapUserToMedicoResponsavel(userDoc);
    if (mapped) return mapped;
  }

  // 2a. Agendamentos do paciente (próximo ativo primeiro; senão mais recente)
  const agendamentos = await withRepositoryRetry(
    AgendamentoEntity,
    (repo) =>
      repo.find({
        where: { pacienteId },
        select: {
          id: true,
          medicoId: true,
          especialidade: true,
          dataHora: true,
          status: true,
          medico: {
            id: true,
            nome: true,
            especialidade: true,
          },
        },
        relations: { medico: true },
        order: { dataHora: "DESC" },
        take: 15,
      }),
    { label: "medico-responsavel:agendamentos" },
  );

  let medicosClinicaCache: MedicoResponsavelDTO[] | null = null;
  const getMedicosClinica = async () => {
    if (!medicosClinicaCache) {
      medicosClinicaCache = await listarMedicosClinica(organizationId);
    }
    return medicosClinicaCache;
  };

  if (agendamentos.length > 0) {
    const agoraMs = Date.now();
    const isCancelado = (st?: string | null) => {
      const upper = String(st || "").toUpperCase();
      return upper === "CANCELADO" || upper === "FALTOU";
    };

    const futurosAtivos = agendamentos
      .filter(
        (a) =>
          !isCancelado(a.status) &&
          a.dataHora &&
          new Date(a.dataHora).getTime() >= agoraMs,
      )
      .sort(
        (a, b) =>
          new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime(),
      );

    const ultimoAtivo = agendamentos.find((a) => !isCancelado(a.status));
    const alvo = futurosAtivos[0] ?? ultimoAtivo ?? agendamentos[0];

    if (alvo?.medico?.nome) {
      const medicosClinica = await getMedicosClinica();
      const alvoNorm = normalizarNomeMedicoComparacao(alvo.medico.nome);
      const matchUser = medicosClinica.find(
        (m) => normalizarNomeMedicoComparacao(m.nome) === alvoNorm,
      );
      if (matchUser) {
        return {
          ...matchUser,
          especialidade:
            matchUser.especialidade || alvo.medico.especialidade?.trim() || null,
        };
      }

      return {
        id: alvo.medico.id,
        nome: alvo.medico.nome.trim(),
        especialidade: alvo.medico.especialidade?.trim() || null,
        crm: null,
      };
    }
  }

  // 2b. Última evolução/atendimento clínico (caso não haja agendamentos)
  const ultimaEvolucao = await withRepositoryRetry(
    EvolucaoClinicaEntity,
    (repo) =>
      repo.findOne({
        where: { pacienteId },
        select: {
          id: true,
          medicoResponsavel: true,
          dataAtendimento: true,
          createdAt: true,
        },
        order: { dataAtendimento: "DESC", createdAt: "DESC" },
      }),
    { label: "medico-responsavel:evolucao" },
  );

  if (ultimaEvolucao?.medicoResponsavel) {
    const rawNome = ultimaEvolucao.medicoResponsavel.trim();
    if (rawNome && !rawNome.toUpperCase().includes("AUTO-MONITORAMENTO")) {
      const medicosClinica = await getMedicosClinica();
      const alvoNorm = normalizarNomeMedicoComparacao(rawNome);
      const matchUser = medicosClinica.find(
        (m) => normalizarNomeMedicoComparacao(m.nome) === alvoNorm,
      );
      if (matchUser) return matchUser;
    }
  }

  // 3. Único médico ativo cadastrado na clínica
  const medicosClinica = await getMedicosClinica();
  if (medicosClinica.length === 1) {
    return medicosClinica[0];
  }

  return null;
}
