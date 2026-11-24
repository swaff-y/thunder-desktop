import { useEntities } from "../../hooks/useEntity";
import type { EntityDetail, Nationality, RecordRef } from "../../types";
import NationalityFlag from "./NationalityFlag";

interface NationalityFlagsProps {
  actors: RecordRef[];
  className?: string;
}

interface FlagGroup {
  nationality: Nationality;
  actorNames: string[];
}

function femaleNationalityGroups(entities: (EntityDetail | undefined)[]): FlagGroup[] {
  const groups = new Map<string, FlagGroup>();
  for (const entity of entities) {
    if (entity?.gender !== "female" || !entity.nationality) continue;
    const { code } = entity.nationality;
    const group = groups.get(code) ?? { nationality: entity.nationality, actorNames: [] };
    group.actorNames.push(entity.name);
    groups.set(code, group);
  }
  return [...groups.values()];
}

export default function NationalityFlags({ actors, className }: NationalityFlagsProps) {
  const reads = useEntities("actor", [...new Set(actors.map((actor) => actor.id))]);
  const groups = femaleNationalityGroups(reads.map((read) => read.data));

  if (groups.length === 0) return null;

  return (
    <>
      <ul className={className ? `nationality-flags ${className}` : "nationality-flags"}>
        {groups.map(({ nationality, actorNames }) => (
          <li key={nationality.code}>
            <NationalityFlag
              nationality={nationality}
              label={`${nationality.displayName}: ${actorNames.join(", ")}`}
            />
          </li>
        ))}
      </ul>
      <style>{`
        .nationality-flags {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        .nationality-flags li {
          display: flex;
        }
      `}</style>
    </>
  );
}
