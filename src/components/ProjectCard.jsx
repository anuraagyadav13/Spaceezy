import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ProjectCard({ project }) {
  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
      <p className="text-sm text-gray-600">{project.city}, {project.state}</p>
      <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
        <span>Type: {project.projectType || project.type}</span>
        <span>Status: {project.status}</span>
        <span>Units: {project.totalUnits ?? "-"}/{project.availableUnits ?? "-"}</span>
        {project.startingPrice && (
          <span>Starting Price: ₹{project.startingPrice}</span>
        )}
      </div>
      <Link href={`/dashboard/inventory/projects/${project.id}`}
        className="inline-flex items-center mt-3 text-purple-600 hover:underline text-sm">
        View Details <ArrowRight size={14} className="ml-1" />
      </Link>
    </div>
  );
}
