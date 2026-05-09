import { MCPServer, text, widget } from "mcp-use/server";
import { z } from "zod";
import { Client } from "@notionhq/client";
import {
  patientSchema,
  segmentSchema,
  type Patient,
  type Segment,
} from "./src/lib/patients/types";

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});
const databaseId = process.env.NOTION_PATIENTS_DATABASE_ID;

const server = new MCPServer({
  name: "dhwani-mcp",
  title: "dhwani-mcp",
  version: "1.0.0",
  description:
    "Dhwani GenUI — visual MCP widgets for the Notion-sourced patient triage canvas: list, demand, dashboard.",
  baseUrl: process.env.MCP_URL || "http://localhost:3011",
  favicon: "favicon.ico",
  websiteUrl: "https://dhwanigenui.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

const patientsInput = z.object({
  patients: z
    .array(patientSchema)
    .default([])
    .describe(
      "Patient rows. Omit or pass an empty array to render placeholders.",
    ),
  segments: z
    .array(segmentSchema)
    .default([])
    .describe("Optional segments for colored dots."),
});

function pickPatients(input: { patients: Patient[] }): Patient[] {
  return input.patients.length ? input.patients : [];
}

server.tool(
  {
    name: "show-patient-list",
    description:
      "Render the patient triage *list* view (KPI tiles + table of patients).",
    schema: patientsInput,
    widget: {
      name: "patient-list",
      invoking: "Loading patients…",
      invoked: "List ready",
    },
  },
  async (input) => {
    const patients = pickPatients(input);
    return widget({
      props: { patients },
      output: text(`Rendered the list view for ${patients.length} patients.`),
    });
  },
);

server.tool(
  {
    name: "add-patient",
    description: "Add a new patient to the EMR system.",
    schema: patientSchema.omit({ id: true, "Last Updated": true }),
    widget: {
      name: "patient-add-form",
      invoking: "Adding new patient…",
      invoked: "Patient added",
    },
  },
  async (input) => {
    if (!databaseId) throw new Error("NOTION_PATIENTS_DATABASE_ID is not set.");
    try {
      const response = await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          Name: { title: [{ text: { content: input.Name } }] },
          Phone: { phone_number: input.Phone },
          Language: { select: { name: input.Language } },
          "Triage Status": { select: { name: input["Triage Status"] } },
          // Optional fields mapping omitted for brevity, but you can fill them out:
          ...(input.Diagnosis ? { Diagnosis: { rich_text: [{ text: { content: input.Diagnosis } }] } } : {}),
          ...(input.Medications ? { Medications: { rich_text: [{ text: { content: input.Medications } }] } } : {}),
          ...(input["Warning Signs"] ? { "Warning Signs": { rich_text: [{ text: { content: input["Warning Signs"] } }] } } : {}),
          ...(input["Doctor Notes"] ? { "Doctor Notes": { rich_text: [{ text: { content: input["Doctor Notes"] } }] } } : {}),
        },
      });
      return widget({
        props: { patient: input, responseId: response.id },
        output: text(`Patient ${input.Name} added successfully.`),
      });
    } catch (e: any) {
      return text(`Failed to add patient: ${e.message}`);
    }
  },
);

server.tool(
  {
    name: "update-patient-triage",
    description: "Update the triage status of a patient.",
    schema: z.object({
      id: z.string(),
      "Triage Status": z.enum(["GREEN", "YELLOW", "RED"]),
    }),
    widget: {
      name: "patient-triage-update",
      invoking: "Updating triage status…",
      invoked: "Triage status updated",
    },
  },
  async (input) => {
    if (!databaseId) throw new Error("NOTION_PATIENTS_DATABASE_ID is not set.");
    try {
      await notion.pages.update({
        page_id: input.id,
        properties: {
          "Triage Status": { select: { name: input["Triage Status"] } },
        },
      });
      return widget({
        props: { patientId: input.id, status: input["Triage Status"] },
        output: text(`Patient ${input.id} triage status updated to ${input["Triage Status"]}.`),
      });
    } catch (e: any) {
      return text(`Failed to update patient triage status: ${e.message}`);
    }
  },
);

server.tool(
  {
    name: "review-discharge-summary",
    description: "Render a form for the doctor to review automatically extracted patient data before saving to the EMR.",
    schema: z.object({
      extractedData: z.object({
        Name: z.string(),
        Phone: z.string().optional().default(""),
        Language: z.string().optional().default("English"),
        "Triage Status": z.enum(["GREEN", "YELLOW", "RED"]).optional().default("GREEN"),
        Diagnosis: z.string().optional().default(""),
        Medications: z.string().optional().default(""),
        "Warning Signs": z.string().optional().default(""),
        "Doctor Notes": z.string().optional().default("")
      }).describe("Data automatically extracted from the discharge summary.")
    }),
    widget: {
      name: "discharge-review",
      invoking: "Formatting discharge review…",
      invoked: "Discharge review ready",
    },
  },
  async (input) => {
    return widget({
      props: input,
      output: text(`Presented discharge review form for patient ${input.extractedData.Name}.`),
    });
  },
);

// Omitted email tools for now as they are not explicitly in the Patient spec, but can be reimplemented if needed.

server.listen().then(() => {
  console.log("MCP server running on port 3011");
});
