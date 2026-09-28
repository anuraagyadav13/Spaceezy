let mockEnquiries = [];

export function submitEnquiry(data) {
    const newEnquiry = {
        id: `ENQ-${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
        status: "NEW"
    };
    
    mockEnquiries.push(newEnquiry);
    
    // In a real app, this would be an API call that eventually creates a CRM lead.
    console.log("Enquiry submitted successfully:", newEnquiry);
    
    return { success: true, id: newEnquiry.id };
}

export function getEnquiries() {
    return mockEnquiries;
}
