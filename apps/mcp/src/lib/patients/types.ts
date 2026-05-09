import { z } from "zod";

export const patientSchema = z.object({
  id: z.string().optional(),
  Name: z.string(),
  Phone: z.string(),
  Language: z.string(),
  "Triage Status": z.enum(["GREEN", "YELLOW", "RED"]),
  "Discharge Summary": z.string().url().optional(),
  Diagnosis: z.string().optional(),
  Medications: z.string().optional(),
  "Warning Signs": z.string().optional(),
  "Call Transcript": z.string().optional(),
  "Doctor Notes": z.string().optional(),
  "Last Updated": z.string().optional(),
});

export type Patient = z.infer<typeof patientSchema>;

export const segmentSchema = z.object({
  label: z.string(),
  color: z.enum(["gray", "blue", "green", "yellow", "red", "purple"]),
});

export type Segment = z.infer<typeof segmentSchema>;
