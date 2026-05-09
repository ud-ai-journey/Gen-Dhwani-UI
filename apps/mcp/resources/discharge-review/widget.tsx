import React, { useState } from "react";
import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

const TriageStatuses = ["GREEN", "YELLOW", "RED"] as const;

const propsSchema = z.object({
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
});

export const widgetMetadata: WidgetMetadata = {
  description: "Form to review and edit extracted discharge summary data before saving to Notion EMR.",
  props: propsSchema,
  exposeAsTool: false
};

type Props = z.infer<typeof propsSchema>;

export default function DischargeReviewForm() {
  const { props, isPending } = useWidget<Props>();
  const { callTool, isPending: isSaving } = useCallTool("add-patient");
  const [formData, setFormData] = useState<Props["extractedData"] | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Initialize form data once props are loaded
  React.useEffect(() => {
    if (!isPending && props.extractedData && !formData) {
      setFormData(props.extractedData);
    }
  }, [isPending, props.extractedData, formData]);

  if (isPending || !formData) {
    return (
      <McpUseProvider autoSize>
        <div className="flex animate-pulse items-center gap-2 p-6 text-sm text-neutral-500 font-mono">
          <span className="size-2 rounded-full bg-blue-500 animate-ping" />
          Loading extracted data...
        </div>
      </McpUseProvider>
    );
  }

  if (isSuccess) {
    return (
      <McpUseProvider autoSize>
        <div className="p-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-neutral-900">Patient Saved to EMR</h3>
          <p className="mt-1 text-sm text-neutral-500">
            The data has been verified and synced to Notion.
          </p>
        </div>
      </McpUseProvider>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => prev ? { ...prev, [name]: value } : null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.Name) return;

    callTool(formData, {
      onSuccess: () => setIsSuccess(true),
      onError: (err) => alert(`Failed to save: ${err instanceof Error ? err.message : String(err)}`),
    });
  };

  return (
    <McpUseProvider autoSize>
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 font-sans">
        <div className="border-b border-neutral-200 bg-neutral-50 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Review Discharge Summary</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Auto-extracted by Vision Agent. Verify and correct before saving.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Patient Name</label>
              <input
                type="text"
                name="Name"
                required
                value={formData.Name}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Phone Number</label>
              <input
                type="text"
                name="Phone"
                value={formData.Phone}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Triage Status</label>
              <select
                name="Triage Status"
                value={formData["Triage Status"]}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-100"
              >
                {TriageStatuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
            </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Language</label>
              <input
                type="text"
                name="Language"
                value={formData.Language}
                onChange={handleChange}
                disabled={isSaving}
                className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
             <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Diagnosis</label>
             <textarea
               name="Diagnosis"
               value={formData.Diagnosis}
               onChange={handleChange}
               disabled={isSaving}
               rows={2}
               className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-y dark:border-neutral-700 dark:text-neutral-100"
             />
          </div>

          <div className="space-y-1.5">
             <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Medications</label>
             <textarea
               name="Medications"
               value={formData.Medications}
               onChange={handleChange}
               disabled={isSaving}
               rows={2}
               className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-y dark:border-neutral-700 dark:text-neutral-100"
             />
          </div>

          <div className="space-y-1.5">
             <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Warning Signs</label>
             <textarea
               name="Warning Signs"
               value={formData["Warning Signs"]}
               onChange={handleChange}
               disabled={isSaving}
               rows={2}
               className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-y dark:border-neutral-700 dark:text-neutral-100"
             />
          </div>

          <div className="space-y-1.5">
             <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Doctor Notes (Optional)</label>
             <textarea
               name="Doctor Notes"
               value={formData["Doctor Notes"]}
               onChange={handleChange}
               disabled={isSaving}
               rows={2}
               className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-y dark:border-neutral-700 dark:text-neutral-100 placeholder:text-neutral-400"
               placeholder="Add any immediate instructions for the daily care agent..."
             />
          </div>

          <div className="pt-2 border-t border-neutral-200 mt-6 flex justify-end gap-3 dark:border-neutral-800">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex cursor-pointer items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              {isSaving ? "Saving to EMR..." : "Confirm & Save"}
            </button>
          </div>
        </form>
      </div>
    </McpUseProvider>
  );
}
