# Fuentes de Datos

Última verificación: 23 de marzo de 2026.

---

## MVP (Piloto)

### Archivos Desclasificados de la SIDE (1973-1983)

26 documentos oficiales de la Secretaría de Inteligencia del Estado desclasificados el 19 de marzo de 2026. Incluyen resoluciones, memorandos, circulares, directivas y manuales organizados en 3 carpetas temáticas. Total: **987 páginas**.

**Acceso:**

| Recurso | URL | Estado |
|---|---|---|
| Portal oficial | https://www.argentina.gob.ar/inteligencia/archivos | OK |
| PDF oficial (todos los documentos) | https://www.argentina.gob.ar/sites/default/files/inteligencia/documentos.pdf | OK |
| Guía de desclasificación | https://www.argentina.gob.ar/sites/default/files/inteligencia/guia_sobre_la_desclasificacion_de_documentos_historicos.pdf | OK |
| OCR comunitario (987 JSONs) | https://github.com/Xyborg/side.com.ar → `data/ocr/` | OK |
| Metadata de documentos | https://side.com.ar/data/documents.json | OK |
| Sitio de exploración | https://side.com.ar/ | OK |

**OCR comunitario:** El repositorio de [Martin Aberastegue](https://github.com/Xyborg/side.com.ar) contiene transcripciones OCR de las 987 páginas en formato JSON. Cada archivo incluye el texto, ID del documento y nivel de confianza. Esto elimina la necesidad de hacer OCR propio.

**Formato OCR JSON:**
```json
{
  "global_page": 1,
  "doc_id": "doc-01",
  "text": "Form. N° 15\nMEMORANDO\nPARA INFORMACION DE:...",
  "confidence": "high"
}
```

**Carpetas temáticas:**
1. Orgánicas, Misiones y Funciones de la SIDE (11 documentos)
2. Normativa Interna - Misión de la SIDE y Delegaciones del Interior (4 documentos)
3. Comisión Asesora de Antecedentes - CAA (11 documentos)

**Licencia:** Dominio público (documentos oficiales del Estado argentino).

---

### RUVTE - Registro Unificado de Víctimas del Terrorismo de Estado

Registro oficial de víctimas del accionar represivo ilegal del Estado argentino entre 1966 y 1983. Publicado por el Ministerio de Justicia, Secretaría de Derechos Humanos.

**Acceso:**

| Recurso | URL | Estado |
|---|---|---|
| Portal de datos | https://datos.jus.gob.ar/dataset/registro-unificado-de-victimas-del-terrorismo-de-estado-ruvte | OK |
| CSV con denuncia formal (8,632 registros) | [Descargar](https://datos.jus.gob.ar/dataset/d43fa140-f43f-4cc2-8491-b1d8bb899de4/resource/c6b674bc-e178-41f3-81f5-0f10038e1688/download/victimas-accionar-represivo-ilegal.csv) | OK |
| CSV sin denuncia formal (783 registros) | [Descargar](https://datos.jus.gob.ar/dataset/d43fa140-f43f-4cc2-8491-b1d8bb899de4/resource/4c66093d-1293-4c44-a4c4-4cc1d914127e/download/victimas-accionar-represivo-ilegal-sin-denuncia-formal.csv) | OK |

**Total: 9,415 registros.**

**Campos del CSV:**
- `anio_denuncia` - Año de la denuncia
- `tipificacion_ruvte` - Tipo: DESAPARICION FORZADA, ASESINATO, etc.
- `id_unico_ruvte` - Identificador único (ej: "ID 5389")
- `apellido_paterno_nombres` - Nombre completo
- `apellido_materno`, `apellido_casada` - Apellidos adicionales
- `edad_al_momento_del_hecho` - Edad (ej: "26 años")
- `documentos` - Número de documento de identidad
- `anio_nacimiento` - Año de nacimiento
- `provincia_pais_nacimiento` - Provincia o país de nacimiento
- `nacionalidad` - Nacionalidad
- `embarazo` - Si estaba embarazada
- `fecha_lugar_detencion_secuestro` - Fecha y lugar (ej: "26/12/1976 LA PLATA BUENOS AIRES")
- `fecha_lugar_asesinato_o_hallazgo_de_restos` - Fecha y lugar
- `fotografia` - Si hay fotografía disponible ("Sí" o vacío)

**Formato:** CSV, UTF-8 con BOM, delimitado por comas.
**Licencia:** Creative Commons Attribution 4.0.
**Datos actualizados hasta:** 30 de diciembre de 2020.

---

## Fuentes Futuras (V2+)

### Informe Nunca Más (CONADEP)
- PDF español: https://www.cultura.gob.ar/media/uploads/lc_nuncamas_digital1.pdf
- HTML inglés: http://www.desaparecidos.org/nuncamas/web/english/library/nevagain/nevagain_001.htm
- ~350 páginas. Requiere OCR del PDF.

### Archive.org - Argentina Declassification Project
- ~47,000 páginas de documentos de CIA, FBI, NSC, State Dept (en inglés)
- Texto pre-OCR disponible (`_djvu.txt`)
- https://archive.org/details/ArgentinaDeclassificationProject

### Desclasificados.org.ar (CELS + Abuelas de Plaza de Mayo)
- 4,903 documentos del gobierno de EEUU sobre la dictadura argentina
- https://desclasificados.org.ar/
- Contacto: proyectodesclasificadoseeuu@gmail.com

### CELS Archive
- Archivo institucional en plataforma AtoM
- https://archivo.cels.org.ar/

### NSA - George Washington University
- Southern Cone Documentation Project: 2,429 documentos
- https://nsarchive.gwu.edu/project/southern-cone-documentation-project

### Memoria Abierta
- 300+ entrevistas audiovisuales (requiere transcripción)
- https://memoriaabierta.org.ar/wp/

---

## URLs Rotas (portal oficial)

Las siguientes URLs del portal argentina.gob.ar devuelven 404 (sitio reestructurado):
- `argentina.gob.ar/defensa/archivos-abiertos/sad`
- `argentina.gob.ar/defensa/archivos-abiertos/desclasificaciones/hallazgo-condor`
- `argentina.gob.ar/defensa/archivos-abiertos/desclasificaciones/actas-de-la-dictadura-1976-1983`
- `argentina.gob.ar/inteligencia/desclasificados`
- `argentina.gob.ar/side/desclasificados`
