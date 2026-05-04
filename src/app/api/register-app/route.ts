import { NextRequest, NextResponse } from "next/server";

interface AppRegistrationData {
  title: string;
  website: string;
  category: string;
  description: string;
  contact: string;
  email: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AppRegistrationData = await request.json();

    const { title, website, category, description, contact, email } = body;

    if (!title || !website || !category || !description || !contact || !email) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Check if Gmail credentials are configured
    const gmailUser = process.env.GMAIL_USER;
    const gmailPassword = process.env.GMAIL_PASSWORD;

    if (!gmailUser || !gmailPassword) {
      // Log to console for development
      console.log("\n=== App Registration Submission ===");
      console.log("App Title:", title);
      console.log("Website URL:", website);
      console.log("Category:", category);
      console.log("Description:", description);
      console.log("Contact Person:", contact);
      console.log("Submitted Email:", email);
      console.log("===================================\n");

      return NextResponse.json(
        { 
          message: "App registration received (Gmail not configured - check server console)",
          data: { title, website, category, description, contact, email }
        },
        { status: 200 }
      );
    }

    // Only import nodemailer if credentials are available
    const nodemailer = await import("nodemailer");

    const transporter = nodemailer.default.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
    });

    const emailContent = `
New App Registration Submission

App Title: ${title}
Website URL: ${website}
Category: ${category}
Description: ${description}
Contact Person: ${contact}
Submitted Email: ${email}

---
This email was submitted through the AICW Apps registration form.
    `;

    await transporter.sendMail({
      from: gmailUser,
      to: "navi.aicw@gmail.com",
      subject: `New App Registration: ${title}`,
      text: emailContent,
      html: `
        <h2>New App Registration Submission</h2>
        <p><strong>App Title:</strong> ${title}</p>
        <p><strong>Website URL:</strong> <a href="${website}" target="_blank">${website}</a></p>
        <p><strong>Category:</strong> ${category}</p>
        <p><strong>Description:</strong> ${description}</p>
        <p><strong>Contact Person:</strong> ${contact}</p>
        <p><strong>Submitted Email:</strong> ${email}</p>
        <hr />
        <p><em>This email was submitted through the AICW Apps registration form.</em></p>
      `,
    });

    return NextResponse.json(
      { message: "App registration submitted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing app registration:", error);
    return NextResponse.json(
      { 
        message: "Failed to process app registration",
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
