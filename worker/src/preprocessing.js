const ACRONYMS = {
  ESMA: "Escuela de Mecánica de la Armada",
  CONADEP: "Comisión Nacional sobre la Desaparición de Personas",
  CCD: "Centro Clandestino de Detención",
  SIDE: "Secretaría de Inteligencia del Estado",
  AAA: "Alianza Anticomunista Argentina Triple A",
  RUVTE: "Registro Unificado de Víctimas del Terrorismo de Estado",
  FFAA: "Fuerzas Armadas",
  PEN: "Poder Ejecutivo Nacional",
  CAA: "Comisión Asesora de Antecedentes",
};

export function preprocessQuery(query) {
  let expanded = query;

  for (const [acronym, full] of Object.entries(ACRONYMS)) {
    const regex = new RegExp(`\\b${acronym}\\b`, "gi");
    if (regex.test(query)) {
      expanded += ` (${full})`;
    }
  }

  return expanded;
}
